import { getEnv } from "./http.ts";

export const MIN_PEPPER_LENGTH = 32;

export interface AbusePreventionPeppers {
  current: string;
  previous: string | null;
}

export interface SubjectDigests {
  subjectDigest: string;
  previousSubjectDigest: string | null;
}

export function loadAbusePreventionPeppers(
  readEnv: (name: string) => string | undefined = getEnv,
): AbusePreventionPeppers | null {
  const current = (readEnv("ABUSE_PREVENTION_PEPPER") ?? "").trim();
  if (current.length < MIN_PEPPER_LENGTH) {
    return null;
  }

  const rawPrevious = readEnv("ABUSE_PREVENTION_PEPPER_PREVIOUS");
  const trimmedPrevious = rawPrevious === undefined ? "" : rawPrevious.trim();
  if (trimmedPrevious.length > 0 && trimmedPrevious.length < MIN_PEPPER_LENGTH) {
    return null;
  }

  const previous =
    trimmedPrevious.length > 0 && trimmedPrevious !== current ? trimmedPrevious : null;
  return { current, previous };
}

export async function computeSubjectDigest(googleSub: string, pepper: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(googleSub));
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v1:${hex}`;
}

export async function deriveSubjectDigests(
  googleSub: string,
  peppers: AbusePreventionPeppers,
): Promise<SubjectDigests> {
  const subjectDigest = await computeSubjectDigest(googleSub, peppers.current);
  const previousSubjectDigest = peppers.previous
    ? await computeSubjectDigest(googleSub, peppers.previous)
    : null;
  return { subjectDigest, previousSubjectDigest };
}
