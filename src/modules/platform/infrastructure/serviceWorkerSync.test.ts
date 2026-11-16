import { describe, expect, it, vi } from "vitest";
import {
  replaySyncQueue,
  type SyncQueueEntry,
  shouldQueueSheetsWrite,
  updateQueueAuthHeaders,
} from "./serviceWorkerSync";

function createFakeQueue(initialRequests: Request[]) {
  const entries: SyncQueueEntry[] = initialRequests.map((request, index) => ({
    request,
    timestamp: 1000 + index,
  }));

  const shiftRequest = vi.fn(async () => entries.shift());
  const unshiftRequest = vi.fn(async (entry: SyncQueueEntry) => {
    entries.unshift(entry);
  });
  const pushRequest = vi.fn(async (entry: SyncQueueEntry) => {
    entries.push(entry);
  });

  return {
    entries,
    shiftRequest,
    unshiftRequest,
    pushRequest,
  };
}

function makeSheetsWriteRequest(
  url = "https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/Logs2026!A1:append",
  body: unknown = { values: [["log-1", "Squat", 5, 100]] },
  method = "POST",
): Request {
  return new Request(url, {
    method,
    headers: {
      Authorization: "Bearer token-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("serviceWorkerSync", () => {
  describe("replaySyncQueue", () => {
    it("drains queued requests and notifies onSuccess when fetch returns HTTP 200", async () => {
      const req1 = makeSheetsWriteRequest();
      const req2 = makeSheetsWriteRequest(undefined, { values: [["log-2", "Bench", 8, 80]] });
      const queue = createFakeQueue([req1, req2]);
      const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
      const onSuccess = vi.fn();

      await replaySyncQueue(queue, { fetchImpl, onSuccess });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(queue.unshiftRequest).not.toHaveBeenCalled();
      expect(queue.entries).toHaveLength(0);
      expect(onSuccess).toHaveBeenCalledWith(2);
    });

    it("re-queues via unshiftRequest, notifies auth required, and throws on HTTP 401", async () => {
      const req = makeSheetsWriteRequest();
      const queue = createFakeQueue([req]);
      const fetchImpl = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
      const onAuthRequired = vi.fn();
      const onSuccess = vi.fn();

      await expect(
        replaySyncQueue(queue, { fetchImpl, onAuthRequired, onSuccess }),
      ).rejects.toThrow(/401/);

      expect(queue.unshiftRequest).toHaveBeenCalledTimes(1);
      expect(queue.entries).toHaveLength(1);
      expect(onAuthRequired).toHaveBeenCalledOnce();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it.each([408, 429, 500, 503])(
      "re-queues via unshiftRequest and throws on retryable HTTP %i",
      async (status) => {
        const req = makeSheetsWriteRequest();
        const queue = createFakeQueue([req]);
        const fetchImpl = vi.fn(async () => new Response("Retry later", { status }));
        const onSuccess = vi.fn();

        await expect(replaySyncQueue(queue, { fetchImpl, onSuccess })).rejects.toThrow(
          new RegExp(String(status)),
        );

        expect(queue.unshiftRequest).toHaveBeenCalledTimes(1);
        expect(queue.entries).toHaveLength(1);
        expect(onSuccess).not.toHaveBeenCalled();
      },
    );

    it("drops non-retryable 4xx validation errors without blocking subsequent queued writes", async () => {
      const badReq = makeSheetsWriteRequest(undefined, { values: [["bad-log"]] });
      const goodReq = makeSheetsWriteRequest(undefined, { values: [["good-log", "Squat"]] });
      const queue = createFakeQueue([badReq, goodReq]);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response("Bad Request", { status: 400 }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }));
      const onSuccess = vi.fn();

      await replaySyncQueue(queue, { fetchImpl, onSuccess });

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(queue.unshiftRequest).not.toHaveBeenCalled();
      expect(queue.entries).toHaveLength(0);
      expect(onSuccess).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("re-queues via unshiftRequest and rethrows when fetch rejects on network error", async () => {
      const req = makeSheetsWriteRequest();
      const queue = createFakeQueue([req]);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const networkError = new TypeError("Failed to fetch");
      const fetchImpl = vi.fn(async () => {
        throw networkError;
      });

      await expect(replaySyncQueue(queue, { fetchImpl })).rejects.toThrow(networkError);

      expect(queue.unshiftRequest).toHaveBeenCalledTimes(1);
      expect(queue.entries).toHaveLength(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("shouldQueueSheetsWrite", () => {
    it("queues non-Log Sheets writes and excludes Logs*, :batchUpdate, and other origins", () => {
      expect(
        shouldQueueSheetsWrite(
          new URL("https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/Profile!A2:F2"),
        ),
      ).toBe(true);
      expect(
        shouldQueueSheetsWrite(
          new URL(
            "https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/Logs2026%21A1:append",
          ),
        ),
      ).toBe(false);
      expect(
        shouldQueueSheetsWrite(
          new URL("https://sheets.googleapis.com/v4/spreadsheets/sheet-1:batchUpdate"),
        ),
      ).toBe(false);
      expect(shouldQueueSheetsWrite(new URL("https://example.com/values/Profile"))).toBe(false);
    });
  });

  describe("updateQueueAuthHeaders", () => {
    it("updates Authorization headers on queued requests while preserving method, url, and body", async () => {
      const req = makeSheetsWriteRequest(
        "https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/Profile!A2:F2",
        { values: [["user", 80]] },
        "PUT",
      );
      const queue = createFakeQueue([req]);

      await updateQueueAuthHeaders(queue, "fresh-token-999");

      expect(queue.entries).toHaveLength(1);
      const updated = queue.entries[0]?.request;
      expect(updated?.headers.get("Authorization")).toBe("Bearer fresh-token-999");
      expect(updated?.method).toBe("PUT");
      expect(await updated?.json()).toEqual({ values: [["user", 80]] });
    });
  });
});
