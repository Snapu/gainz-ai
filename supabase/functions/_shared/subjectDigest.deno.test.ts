import assert from "node:assert/strict";
import {
  computeSubjectDigest,
  deriveSubjectDigests,
  loadAbusePreventionPeppers,
} from "./subjectDigest.ts";

const PEPPER_A = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"; // 32 chars
const PEPPER_B = "z9y8x7w6v5u4z9y8x7w6v5u4z9y8x7w6"; // 32 chars

Deno.test("loadAbusePreventionPeppers enforces missing/short pepper bounds and optional previous pepper", () => {
  assert.equal(
    loadAbusePreventionPeppers(() => undefined),
    null,
  );
  assert.equal(
    loadAbusePreventionPeppers(() => "too-short-pepper"),
    null,
  );

  assert.deepEqual(
    loadAbusePreventionPeppers((name) =>
      name === "ABUSE_PREVENTION_PEPPER" ? `  ${PEPPER_A}  ` : undefined,
    ),
    { current: PEPPER_A, previous: null },
  );

  // Short previous pepper fails closed so rotation typos are rejected
  assert.equal(
    loadAbusePreventionPeppers((name) => {
      if (name === "ABUSE_PREVENTION_PEPPER") return PEPPER_A;
      if (name === "ABUSE_PREVENTION_PEPPER_PREVIOUS") return "short";
      return undefined;
    }),
    null,
  );

  // Identical previous pepper deduplicates to null
  assert.deepEqual(
    loadAbusePreventionPeppers((name) =>
      name === "ABUSE_PREVENTION_PEPPER" || name === "ABUSE_PREVENTION_PEPPER_PREVIOUS"
        ? PEPPER_A
        : undefined,
    ),
    { current: PEPPER_A, previous: null },
  );

  assert.deepEqual(
    loadAbusePreventionPeppers((name) => {
      if (name === "ABUSE_PREVENTION_PEPPER") return PEPPER_B;
      if (name === "ABUSE_PREVENTION_PEPPER_PREVIOUS") return PEPPER_A;
      return undefined;
    }),
    { current: PEPPER_B, previous: PEPPER_A },
  );
});

Deno.test("computeSubjectDigest produces deterministic v1:HMAC_SHA256 digests and deriveSubjectDigests supports rotation", async () => {
  const digest1 = await computeSubjectDigest("google-sub-123", PEPPER_A);
  const digest2 = await computeSubjectDigest("google-sub-123", PEPPER_A);
  const digestOtherUser = await computeSubjectDigest("google-sub-456", PEPPER_A);

  assert.match(digest1, /^v1:[0-9a-f]{64}$/);
  assert.equal(digest1, digest2);
  assert.notEqual(digest1, digestOtherUser);
  assert.equal(digest1.includes("google-sub-123"), false);

  const derived = await deriveSubjectDigests("google-sub-123", {
    current: PEPPER_B,
    previous: PEPPER_A,
  });
  assert.match(derived.subjectDigest, /^v1:[0-9a-f]{64}$/);
  assert.equal(derived.previousSubjectDigest, digest1);
  assert.notEqual(derived.subjectDigest, derived.previousSubjectDigest);
});
