import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentryScrubber";

describe("scrubSentryEvent", () => {
  it("strips user, sensitive headers, URL params, and query strings", () => {
    const scrubbed = scrubSentryEvent({
      user: { id: "user-1", email: "athlete@example.com" },
      request: {
        url: "https://app.example.com/callback?code=secret-code&access_token=tok-1&view=home",
        query_string: "id_token=jwt-secret&tab=coach",
        headers: {
          Authorization: "Bearer super-secret",
          "x-api-key": "key-123",
          Accept: "application/json",
        },
      },
    });

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request?.url).toBe(
      "https://app.example.com/callback?code=[REDACTED]&access_token=[REDACTED]&view=home",
    );
    expect(scrubbed.request?.query_string).toBe("id_token=[REDACTED]&tab=coach");
    expect(scrubbed.request?.headers).toEqual({ Accept: "application/json" });
  });

  it("scrubs hash-fragment tokens without over-redacting across # delimiters", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        url: "https://app.example.com/?token=secret-1#/app/home?access_token=secret-2&view=coach",
      },
      extra: {
        oauthRedirect: "https://app.example.com/#id_token=jwt-secret&state=ok",
      },
    });

    expect(scrubbed.request?.url).toBe(
      "https://app.example.com/?token=[REDACTED]#/app/home?access_token=[REDACTED]&view=coach",
    );
    expect(scrubbed.extra?.oauthRedirect).toBe(
      "https://app.example.com/#id_token=[REDACTED]&state=ok",
    );
  });

  it("recursively scrubs sensitive keys and URL tokens in nested objects and arrays", () => {
    const scrubbed = scrubSentryEvent({
      extra: {
        nested: {
          access_token: "secret-access",
          coachingAdviceText: "private workout text",
          redirectUrl: "https://app.example.com?token=abc-123",
          attempts: [
            { refresh_token: "rt-1", status: 500 },
            "https://app.example.com?refresh_token=rt-2&ok=1",
          ],
        },
      },
      breadcrumbs: [
        {
          data: {
            url: "https://api.example.com/items?id_token=jwt-1",
            payload: { rawJson: '{"secret":true}', ok: true },
          },
        },
      ],
    });

    expect(scrubbed.extra).toEqual({
      nested: {
        redirectUrl: "https://app.example.com?token=[REDACTED]",
        attempts: [{ status: 500 }, "https://app.example.com?refresh_token=[REDACTED]&ok=1"],
      },
    });
    expect(scrubbed.breadcrumbs).toEqual([
      {
        data: {
          url: "https://api.example.com/items?id_token=[REDACTED]",
          payload: { ok: true },
        },
      },
    ]);
  });

  it("handles cyclic object and array references without overflowing", () => {
    const cyclicObj: Record<string, unknown> = {
      token: "should-strip",
      safe: "https://example.com?code=123",
    };
    cyclicObj.self = cyclicObj;
    const cyclicArr: unknown[] = ["https://example.com?access_token=xyz"];
    cyclicArr.push(cyclicArr);

    const scrubbed = scrubSentryEvent({
      extra: { cyclicObj, cyclicArr },
    });

    expect(cyclicObj.token).toBeUndefined();
    expect(cyclicObj.safe).toBe("https://example.com?code=[REDACTED]");
    expect(cyclicObj.self).toBe(cyclicObj);
    expect(scrubbed.extra?.cyclicArr).toBe(cyclicArr);
    expect(cyclicArr[0]).toBe("https://example.com?access_token=[REDACTED]");
  });
});
