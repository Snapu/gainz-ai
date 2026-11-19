import assert from "node:assert/strict";
import {
  corsHeaders,
  corsPreflightResponse,
  extractClientIp,
  fetchWithTimeout,
  jsonResponse,
  MAX_REQUEST_BODY_BYTES,
  parsePositiveIntEnv,
  readJsonBodyWithLimit,
} from "./http.ts";

Deno.test("extractClientIp respects header precedence and ignores blank values", () => {
  const withCf = new Request("https://example.test", {
    headers: {
      "cf-connecting-ip": " 203.0.113.9 ",
      "x-forwarded-for": "198.51.100.1, 198.51.100.2",
      "x-real-ip": "192.0.2.5",
    },
  });
  assert.equal(extractClientIp(withCf), "203.0.113.9");

  const withXff = new Request("https://example.test", {
    headers: {
      "cf-connecting-ip": "   ",
      "x-forwarded-for": "198.51.100.1, , 198.51.100.77 , ",
      "x-real-ip": "192.0.2.5",
    },
  });
  assert.equal(extractClientIp(withXff), "198.51.100.77");

  const withRealIp = new Request("https://example.test", {
    headers: {
      "x-forwarded-for": " , , ",
      "x-real-ip": " 192.0.2.88 ",
    },
  });
  assert.equal(extractClientIp(withRealIp), "192.0.2.88");

  const missing = new Request("https://example.test");
  assert.equal(extractClientIp(missing), undefined);
});

Deno.test("readJsonBodyWithLimit parses valid payloads up to exact 100 KB cap", async () => {
  const validReq = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ hello: "world", count: 2 }),
  });
  assert.deepEqual(await readJsonBodyWithLimit(validReq), {
    ok: true,
    data: { hello: "world", count: 2 },
  });

  const prefix = '{"pad":"';
  const suffix = '"}';
  const exactPad = "a".repeat(MAX_REQUEST_BODY_BYTES - prefix.length - suffix.length);
  const exactPayload = `${prefix}${exactPad}${suffix}`;
  assert.equal(new TextEncoder().encode(exactPayload).byteLength, MAX_REQUEST_BODY_BYTES);

  const exactReq = new Request("https://example.test", {
    method: "POST",
    body: exactPayload,
  });
  const exactResult = await readJsonBodyWithLimit(exactReq);
  assert.equal(exactResult.ok, true);
});

Deno.test("readJsonBodyWithLimit rejects oversized declared, streamed, spoofed, and UTF-8 bodies", async () => {
  const declaredTooLarge = new Request("https://example.test", {
    method: "POST",
    headers: { "content-length": String(MAX_REQUEST_BODY_BYTES + 1) },
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readJsonBodyWithLimit(declaredTooLarge), {
    ok: false,
    status: 413,
    error: "payload-too-large",
  });

  const encoder = new TextEncoder();
  const makeOversizedStream = (spoofedContentLength?: string) => {
    let cancelled = false;
    let chunksSent = 0;
    const chunk = encoder.encode("x".repeat(40 * 1024));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunksSent < 10) {
          chunksSent++;
          controller.enqueue(chunk);
          return;
        }
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = new Request("https://example.test", {
      method: "POST",
      headers: spoofedContentLength ? { "content-length": spoofedContentLength } : undefined,
      body: stream,
    });
    return { req, wasCancelled: () => cancelled };
  };

  const unannouncedStream = makeOversizedStream();
  assert.deepEqual(await readJsonBodyWithLimit(unannouncedStream.req), {
    ok: false,
    status: 413,
    error: "payload-too-large",
  });
  assert.equal(unannouncedStream.wasCancelled(), true);

  const spoofedStream = makeOversizedStream("10");
  assert.deepEqual(await readJsonBodyWithLimit(spoofedStream.req), {
    ok: false,
    status: 413,
    error: "payload-too-large",
  });
  assert.equal(spoofedStream.wasCancelled(), true);

  // JS string length (~52k chars) < 102400, but 4-byte UTF-8 emojis exceed 100 KB
  const multiByteJson = JSON.stringify({ note: "💪".repeat(26_000) });
  assert.equal(multiByteJson.length < MAX_REQUEST_BODY_BYTES, true);
  assert.equal(encoder.encode(multiByteJson).byteLength > MAX_REQUEST_BODY_BYTES, true);

  const multiByteReq = new Request("https://example.test", {
    method: "POST",
    body: multiByteJson,
  });
  assert.deepEqual(await readJsonBodyWithLimit(multiByteReq), {
    ok: false,
    status: 413,
    error: "payload-too-large",
  });
});

Deno.test("readJsonBodyWithLimit rejects empty, null, and malformed JSON bodies with 400", async () => {
  const nullBodyReq = new Request("https://example.test", { method: "POST" });
  assert.deepEqual(await readJsonBodyWithLimit(nullBodyReq), {
    ok: false,
    status: 400,
    error: "invalid-json",
  });

  const whitespaceReq = new Request("https://example.test", {
    method: "POST",
    body: "   \n\t ",
  });
  assert.deepEqual(await readJsonBodyWithLimit(whitespaceReq), {
    ok: false,
    status: 400,
    error: "invalid-json",
  });

  const malformedReq = new Request("https://example.test", {
    method: "POST",
    body: '{"broken":',
  });
  assert.deepEqual(await readJsonBodyWithLimit(malformedReq), {
    ok: false,
    status: 400,
    error: "invalid-json",
  });
});

Deno.test("parsePositiveIntEnv returns valid positive ints or fallback", () => {
  const envKey = "GAINZ_TEST_POSITIVE_INT";
  try {
    Deno.env.delete(envKey);
    assert.equal(parsePositiveIntEnv(envKey, 15), 15);

    Deno.env.set(envKey, "42");
    assert.equal(parsePositiveIntEnv(envKey, 15), 42);

    Deno.env.set(envKey, "0");
    assert.equal(parsePositiveIntEnv(envKey, 15), 15);

    Deno.env.set(envKey, "-8");
    assert.equal(parsePositiveIntEnv(envKey, 15), 15);

    Deno.env.set(envKey, "not-a-number");
    assert.equal(parsePositiveIntEnv(envKey, 15), 15);
  } finally {
    Deno.env.delete(envKey);
  }
});

Deno.test("fetchWithTimeout resolves fast responses and aborts slow requests", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () => Promise.resolve(new Response("fast-ok", { status: 200 }));
    const fastRes = await fetchWithTimeout("https://example.test/fast", { method: "GET" }, 200);
    assert.equal(fastRes.status, 200);
    assert.equal(await fastRes.text(), "fast-ok");

    globalThis.fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("Missing signal"));
          return;
        }
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort);
      });

    await assert.rejects(
      () => fetchWithTimeout("https://example.test/slow", { method: "GET" }, 30),
      (err: unknown) => err instanceof DOMException && err.name === "AbortError",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("corsPreflightResponse and jsonResponse include standard CORS and custom headers", async () => {
  const preflight = corsPreflightResponse();
  assert.equal(preflight.status, 200);
  assert.equal(await preflight.text(), "ok");
  for (const [k, v] of Object.entries(corsHeaders)) {
    assert.equal(preflight.headers.get(k), v);
  }

  const res = jsonResponse({ error: "rate-limited" }, 429, { "Retry-After": "45" });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Content-Type"), "application/json");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(res.headers.get("Retry-After"), "45");
  assert.deepEqual(await res.json(), { error: "rate-limited" });
});
