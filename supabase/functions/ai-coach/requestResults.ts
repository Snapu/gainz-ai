import { fetchWithTimeout } from "../_shared/http.ts";

const SUPABASE_REST_TIMEOUT_MS = 5000;
const RESULT_TTL_MS = 30 * 60 * 1000;

export type AiRequestResultStatus = "processing" | "completed" | "failed";

export interface AiRequestResultRow {
  status: AiRequestResultStatus;
  response_payload: unknown | null;
  error_code: string | null;
}

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
  markCompleted(userId: string, clientRequestId: string, responsePayload: unknown): Promise<void>;
  markFailed(userId: string, clientRequestId: string, errorCode: string): Promise<void>;
  deleteEntry(userId: string, clientRequestId: string): Promise<void>;
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

  async function patchEntry(
    userId: string,
    clientRequestId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      const res = await fetchWithTimeout(
        `${baseUrl}?${keyFilter(userId, clientRequestId)}`,
        {
          method: "PATCH",
          headers: serviceHeaders(serviceRoleKey, { "Content-Type": "application/json" }),
          body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
        },
        SUPABASE_REST_TIMEOUT_MS,
      );
      if (!res.ok) {
        console.warn("ai_request_results update failed:", { status: res.status });
      }
    } catch (err) {
      console.warn("ai_request_results update error:", {
        error: err instanceof Error ? err.name : "unknown-error",
      });
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
      return patchEntry(userId, clientRequestId, {
        status: "completed",
        response_payload: responsePayload,
        error_code: null,
      });
    },

    markFailed(userId, clientRequestId, errorCode) {
      return patchEntry(userId, clientRequestId, {
        status: "failed",
        response_payload: null,
        error_code: errorCode,
      });
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
