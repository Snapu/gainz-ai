import { fetchWithTimeout } from "../_shared/http.ts";

const SUPABASE_REST_TIMEOUT_MS = 5000;
const RESULT_TTL_MS = 30 * 60 * 1000;
const PATCH_RETRY_DELAYS_MS = [200, 600] as const;

export type AiRequestResultStatus = "processing" | "completed" | "failed";

export interface AiRequestResultRow {
  status: AiRequestResultStatus;
  response_payload: unknown | null;
  error_code: string | null;
}

export type AiRequestResultWriteResult =
  | { ok: true }
  | { ok: false; error: "http-error"; status: number }
  | { ok: false; error: "not-found" }
  | { ok: false; error: "request-error"; errorName: string };

export interface AiRequestResultsStore {
  getActive(userId: string, clientRequestId: string): Promise<AiRequestResultRow | null | "error">;
  claimTerminalResult(
    userId: string,
    clientRequestId: string,
  ): Promise<AiRequestResultRow | null | "error">;
  acquireProcessingLock(
    userId: string,
    clientRequestId: string,
  ): Promise<"acquired" | "conflict" | "error">;
  markCompleted(
    userId: string,
    clientRequestId: string,
    responsePayload: unknown,
  ): Promise<AiRequestResultWriteResult>;
  markFailed(
    userId: string,
    clientRequestId: string,
    errorCode: string,
  ): Promise<AiRequestResultWriteResult>;
  deleteEntry(userId: string, clientRequestId: string): Promise<void>;
}

function isRetryablePatchStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function extractErrorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err && typeof err.name === "string" && err.name) {
    return err.name;
  }
  return "unknown-error";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keyFilter(userId: string, clientRequestId: string): string {
  return `user_id=eq.${encodeURIComponent(userId)}&client_request_id=eq.${encodeURIComponent(clientRequestId)}`;
}

function serviceHeaders(serviceRoleKey: string, extra?: Record<string, string>): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

export function createSupabaseRequestResultsStore(
  supabaseUrl: string,
  serviceRoleKey: string,
): AiRequestResultsStore {
  const baseUrl = `${supabaseUrl}/rest/v1/ai_request_results`;

  async function executePatchAttempt(
    userId: string,
    clientRequestId: string,
    body: Record<string, unknown>,
    attempt: number,
    canRetry: boolean,
    extraFilter = "",
  ): Promise<{ result: AiRequestResultWriteResult; willRetry: boolean }> {
    try {
      const res = await fetchWithTimeout(
        `${baseUrl}?${keyFilter(userId, clientRequestId)}${extraFilter}&select=client_request_id`,
        {
          method: "PATCH",
          headers: serviceHeaders(serviceRoleKey, {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          }),
          body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
        },
        SUPABASE_REST_TIMEOUT_MS,
      );
      if (!res.ok) {
        void res.body?.cancel().catch(() => {});
        const willRetry = canRetry && isRetryablePatchStatus(res.status);
        console.warn("ai_request_results update failed:", {
          status: res.status,
          attempt,
          willRetry,
        });
        return { result: { ok: false, error: "http-error", status: res.status }, willRetry };
      }

      const rows = (await res.json()) as unknown[];
      if (Array.isArray(rows) && rows.length > 0) {
        return { result: { ok: true }, willRetry: false };
      }
      if (attempt > 1 && Array.isArray(rows)) {
        console.warn(
          "ai_request_results update matched no rows on retry; assuming already claimed:",
          { attempt },
        );
        return { result: { ok: true }, willRetry: false };
      }
      console.warn("ai_request_results update matched no rows:", { attempt });
      return { result: { ok: false, error: "not-found" }, willRetry: false };
    } catch (err) {
      const errorName = extractErrorName(err);
      const willRetry = canRetry;
      console.warn("ai_request_results update error:", {
        error: errorName,
        attempt,
        willRetry,
      });
      return { result: { ok: false, error: "request-error", errorName }, willRetry };
    }
  }

  async function patchEntry(
    userId: string,
    clientRequestId: string,
    body: Record<string, unknown>,
    retryDelaysMs: readonly number[],
    extraFilter = "",
  ): Promise<AiRequestResultWriteResult> {
    const maxAttempts = retryDelaysMs.length + 1;
    for (let attempt = 1; ; attempt++) {
      const { result, willRetry } = await executePatchAttempt(
        userId,
        clientRequestId,
        body,
        attempt,
        attempt < maxAttempts,
        extraFilter,
      );
      if (result.ok || !willRetry) {
        return result;
      }
      const delayMs = retryDelaysMs[attempt - 1];
      if (delayMs === undefined) {
        return result;
      }
      await wait(delayMs);
    }
  }

  return {
    async getActive(userId, clientRequestId) {
      try {
        const nowIso = encodeURIComponent(new Date().toISOString());
        const res = await fetchWithTimeout(
          `${baseUrl}?${keyFilter(userId, clientRequestId)}&expires_at=gt.${nowIso}&select=status,response_payload,error_code&limit=1`,
          { method: "GET", headers: serviceHeaders(serviceRoleKey) },
          SUPABASE_REST_TIMEOUT_MS,
        );
        if (!res.ok) return "error";
        const rows = (await res.json()) as AiRequestResultRow[];
        return Array.isArray(rows) && rows[0] ? rows[0] : null;
      } catch {
        return "error";
      }
    },

    async claimTerminalResult(userId, clientRequestId) {
      try {
        const nowIso = encodeURIComponent(new Date().toISOString());
        const res = await fetchWithTimeout(
          `${baseUrl}?${keyFilter(userId, clientRequestId)}&status=in.(completed,failed)&expires_at=gt.${nowIso}&select=status,response_payload,error_code`,
          {
            method: "DELETE",
            headers: serviceHeaders(serviceRoleKey, { Prefer: "return=representation" }),
          },
          SUPABASE_REST_TIMEOUT_MS,
        );
        if (!res.ok) return "error";
        const rows = (await res.json()) as AiRequestResultRow[];
        return Array.isArray(rows) && rows[0] ? rows[0] : null;
      } catch {
        return "error";
      }
    },

    async acquireProcessingLock(userId, clientRequestId) {
      const tryInsert = async (nowMs: number): Promise<"acquired" | "conflict" | "error"> => {
        const res = await fetchWithTimeout(
          `${baseUrl}?on_conflict=user_id,client_request_id`,
          {
            method: "POST",
            headers: serviceHeaders(serviceRoleKey, {
              "Content-Type": "application/json",
              Prefer: "resolution=ignore-duplicates,return=representation",
            }),
            body: JSON.stringify({
              user_id: userId,
              client_request_id: clientRequestId,
              action: "coach",
              status: "processing",
              expires_at: new Date(nowMs + RESULT_TTL_MS).toISOString(),
            }),
          },
          SUPABASE_REST_TIMEOUT_MS,
        );
        if (!res.ok) return "error";
        const rows = (await res.json()) as unknown[];
        return Array.isArray(rows) && rows.length > 0 ? "acquired" : "conflict";
      };

      try {
        const nowMs = Date.now();
        const firstAttempt = await tryInsert(nowMs);
        if (firstAttempt !== "conflict") return firstAttempt;

        // Only clear an expired PK conflict when insert collided so happy path uses a single round trip
        const nowIso = encodeURIComponent(new Date(nowMs).toISOString());
        const deleteExpiredRes = await fetchWithTimeout(
          `${baseUrl}?${keyFilter(userId, clientRequestId)}&expires_at=lte.${nowIso}&select=client_request_id`,
          {
            method: "DELETE",
            headers: serviceHeaders(serviceRoleKey, { Prefer: "return=representation" }),
          },
          SUPABASE_REST_TIMEOUT_MS,
        );
        if (!deleteExpiredRes.ok) return "conflict";
        const deleted = (await deleteExpiredRes.json()) as unknown[];
        if (!Array.isArray(deleted) || deleted.length === 0) return "conflict";

        return await tryInsert(Date.now());
      } catch {
        return "error";
      }
    },

    markCompleted(userId, clientRequestId, responsePayload) {
      return patchEntry(
        userId,
        clientRequestId,
        {
          status: "completed",
          response_payload: responsePayload,
          error_code: null,
        },
        PATCH_RETRY_DELAYS_MS,
      );
    },

    markFailed(userId, clientRequestId, errorCode) {
      return patchEntry(
        userId,
        clientRequestId,
        {
          status: "failed",
          response_payload: null,
          error_code: errorCode,
        },
        [],
        "&status=eq.processing",
      );
    },

    async deleteEntry(userId, clientRequestId) {
      try {
        await fetchWithTimeout(
          `${baseUrl}?${keyFilter(userId, clientRequestId)}`,
          { method: "DELETE", headers: serviceHeaders(serviceRoleKey) },
          SUPABASE_REST_TIMEOUT_MS,
        );
      } catch (err) {
        console.warn("ai_request_results delete error:", {
          error: err instanceof Error ? err.name : "unknown-error",
        });
      }
    },
  };
}
