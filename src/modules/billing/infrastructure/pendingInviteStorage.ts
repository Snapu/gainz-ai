const PENDING_INVITE_STORAGE_KEY = "gainz-pending-invite-code";

function extractNormalizedInvite(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function scrubSearchString(rawSearch: string): {
  code: string | null;
  cleanedSearch: string;
  changed: boolean;
} {
  if (!rawSearch) {
    return { code: null, cleanedSearch: "", changed: false };
  }
  const params = new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch);
  const matchingKeys = [...new Set([...params.keys()].filter((k) => k.toLowerCase() === "invite"))];
  if (matchingKeys.length === 0) {
    return { code: null, cleanedSearch: rawSearch, changed: false };
  }
  let code: string | null = null;
  for (const key of matchingKeys) {
    for (const value of params.getAll(key)) {
      code = code ?? extractNormalizedInvite(value);
    }
    params.delete(key);
  }
  const next = params.toString();
  return {
    code,
    cleanedSearch: next ? `?${next}` : "",
    changed: true,
  };
}

function scrubHashQuery(rawHash: string): {
  code: string | null;
  cleanedHash: string;
  changed: boolean;
} {
  const queryIdx = rawHash.indexOf("?");
  if (queryIdx === -1) {
    return { code: null, cleanedHash: rawHash, changed: false };
  }
  const hashPath = rawHash.slice(0, queryIdx);
  const hashQuery = rawHash.slice(queryIdx);
  const scrubbed = scrubSearchString(hashQuery);
  return {
    code: scrubbed.code,
    cleanedHash: `${hashPath}${scrubbed.cleanedSearch}`,
    changed: scrubbed.changed,
  };
}

export function peekPendingInviteCode(): string | null {
  try {
    return extractNormalizedInvite(sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearPendingInviteCode(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  } catch {
    // Ignore restricted sessionStorage
  }
}

export function capturePendingInviteFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  const searchResult = scrubSearchString(window.location.search);
  const hashResult = scrubHashQuery(window.location.hash);
  const capturedCode = searchResult.code ?? hashResult.code;

  if (capturedCode) {
    try {
      sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, capturedCode);
    } catch {
      // Ignore restricted sessionStorage
    }
  }

  if (searchResult.changed || hashResult.changed) {
    const cleanUrl = `${window.location.pathname}${searchResult.cleanedSearch}${hashResult.cleanedHash}`;
    try {
      window.history.replaceState(window.history.state, "", cleanUrl);
    } catch {
      // Ignore history mutation errors
    }
  }

  return capturedCode;
}
