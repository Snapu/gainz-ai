export const DEFAULT_GOOGLE_CLIENT_ID =
  "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";

export const MAX_REQUEST_BODY_BYTES = 100 * 1024;

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface DenoRuntimeLike {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}

export function getDenoRuntime(): DenoRuntimeLike | undefined {
  return (globalThis as { Deno?: DenoRuntimeLike }).Deno;
}

export function getEnv(name: string): string | undefined {
  return getDenoRuntime()?.env.get(name);
}

export function parsePositiveIntEnv(envName: string, fallback: number): number {
  const parsed = Number.parseInt(getEnv(envName) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function corsPreflightResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function extractClientIp(req: Request): string | undefined {
  // Supabase sits behind Cloudflare (`cf-connecting-ip`); reverse proxies append hops at the tail of x-forwarded-for
  const forwardedFor = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    forwardedFor?.at(-1) ||
    req.headers.get("x-real-ip")?.trim() ||
    undefined
  );
}

export type ReadJsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; status: 400 | 413; error: "invalid-json" | "payload-too-large" };

export async function readJsonBodyWithLimit(
  req: Request,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): Promise<ReadJsonBodyResult> {
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const declaredLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, status: 413, error: "payload-too-large" };
    }
  }

  let rawText: string;
  if (req.body) {
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          return { ok: false, status: 413, error: "payload-too-large" };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, status: 400, error: "invalid-json" };
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    rawText = new TextDecoder().decode(merged);
  } else {
    try {
      rawText = await req.text();
    } catch {
      return { ok: false, status: 400, error: "invalid-json" };
    }
    if (new TextEncoder().encode(rawText).byteLength > maxBytes) {
      return { ok: false, status: 413, error: "payload-too-large" };
    }
  }

  if (!rawText.trim()) {
    return { ok: false, status: 400, error: "invalid-json" };
  }

  try {
    return { ok: true, data: JSON.parse(rawText) };
  } catch {
    return { ok: false, status: 400, error: "invalid-json" };
  }
}
