import { isNonRetryableClientStatus, isRetryableHttpStatus } from "./utils/httpErrors";

export interface SyncQueueEntry {
  request: Request;
  timestamp?: number;
  metadata?: object;
}

export interface SyncQueueLike {
  shiftRequest(): Promise<SyncQueueEntry | undefined>;
  unshiftRequest(entry: SyncQueueEntry): Promise<void>;
  pushRequest(entry: SyncQueueEntry): Promise<void>;
}

export interface ReplaySyncQueueOptions {
  fetchImpl?: typeof fetch;
  onAuthRequired?: () => Promise<void> | void;
  onSuccess?: (replayedCount: number) => Promise<void> | void;
}

export function shouldQueueSheetsWrite(url: URL): boolean {
  if (url.origin !== "https://sheets.googleapis.com") return false;
  const pathname = decodeURIComponent(url.pathname);
  return !pathname.endsWith(":batchUpdate") && !/\/values\/Logs/i.test(pathname);
}

export async function replaySyncQueue(
  queue: SyncQueueLike,
  options: ReplaySyncQueueOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let replayedCount = 0;
  let entry = await queue.shiftRequest();

  while (entry) {
    let response: Response;
    try {
      response = await fetchImpl(entry.request.clone());
    } catch (error) {
      console.error("Replay failed for request", entry.request, error);
      await queue.unshiftRequest(entry);
      throw error;
    }

    if (response.ok) {
      replayedCount += 1;
      entry = await queue.shiftRequest();
      continue;
    }

    if (isRetryableHttpStatus(response.status)) {
      if (response.status === 401) {
        await options.onAuthRequired?.();
      }
      await queue.unshiftRequest(entry);
      throw new Error(`Replay failed with retryable HTTP ${response.status}`);
    }

    if (isNonRetryableClientStatus(response.status)) {
      console.error(
        `Dropping non-retryable HTTP ${response.status} request from sync queue:`,
        entry.request.url,
      );
      entry = await queue.shiftRequest();
      continue;
    }

    await queue.unshiftRequest(entry);
    throw new Error(`Replay failed with HTTP ${response.status}`);
  }

  if (replayedCount > 0) {
    await options.onSuccess?.(replayedCount);
  }
}

export async function updateQueueAuthHeaders(
  queue: SyncQueueLike,
  accessToken: string,
): Promise<void> {
  if (!accessToken) return;

  const entries: SyncQueueEntry[] = [];
  let entry = await queue.shiftRequest();
  while (entry) {
    entries.push(entry);
    entry = await queue.shiftRequest();
  }

  for (const item of entries) {
    const headers = new Headers(item.request.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    const body =
      item.request.method !== "GET" && item.request.method !== "HEAD"
        ? await item.request.clone().arrayBuffer()
        : undefined;
    const updatedRequest = new Request(item.request.url, {
      method: item.request.method,
      headers,
      body,
    });
    await queue.pushRequest({ ...item, request: updatedRequest });
  }
}
