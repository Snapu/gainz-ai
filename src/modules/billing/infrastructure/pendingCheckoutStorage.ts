const PENDING_CHECKOUT_POLL_KEY = "gainz-pending-checkout-return";
const PENDING_CHECKOUT_ROUTE_KEY = "gainz-pending-checkout-route";

function scrubCheckoutSearch(rawSearch: string): {
  isSuccess: boolean;
  cleanedSearch: string;
  changed: boolean;
} {
  if (!rawSearch) {
    return { isSuccess: false, cleanedSearch: "", changed: false };
  }
  const params = new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch);
  const matchingKeys = [
    ...new Set([...params.keys()].filter((key) => key.toLowerCase() === "checkout")),
  ];
  if (matchingKeys.length === 0) {
    return { isSuccess: false, cleanedSearch: rawSearch, changed: false };
  }

  let isSuccess = false;
  for (const key of matchingKeys) {
    for (const val of params.getAll(key)) {
      if (val.trim().toLowerCase() === "success") {
        isSuccess = true;
      }
    }
    params.delete(key);
  }

  const next = params.toString();
  return {
    isSuccess,
    cleanedSearch: next ? `?${next}` : "",
    changed: true,
  };
}

function scrubCheckoutHash(rawHash: string): {
  isSuccess: boolean;
  cleanedHash: string;
  changed: boolean;
} {
  const queryIdx = rawHash.indexOf("?");
  if (queryIdx === -1) {
    return { isSuccess: false, cleanedHash: rawHash, changed: false };
  }
  const hashPath = rawHash.slice(0, queryIdx);
  const scrubbed = scrubCheckoutSearch(rawHash.slice(queryIdx));
  return {
    isSuccess: scrubbed.isSuccess,
    cleanedHash: `${hashPath}${scrubbed.cleanedSearch}`,
    changed: scrubbed.changed,
  };
}

export function hasPendingCheckoutReturn(): boolean {
  try {
    return sessionStorage.getItem(PENDING_CHECKOUT_POLL_KEY) === "success";
  } catch {
    return false;
  }
}

export function hasPendingCheckoutRoute(): boolean {
  try {
    return sessionStorage.getItem(PENDING_CHECKOUT_ROUTE_KEY) === "coach";
  } catch {
    return false;
  }
}

export function clearPendingCheckoutPoll(): void {
  try {
    sessionStorage.removeItem(PENDING_CHECKOUT_POLL_KEY);
  } catch {
    // Ignore restricted sessionStorage
  }
}

export function clearPendingCheckoutRoute(): void {
  try {
    sessionStorage.removeItem(PENDING_CHECKOUT_ROUTE_KEY);
  } catch {
    // Ignore restricted sessionStorage
  }
}

export function clearPendingCheckoutReturn(): void {
  clearPendingCheckoutPoll();
  clearPendingCheckoutRoute();
}

export function capturePendingCheckoutReturnFromUrl(): boolean {
  if (typeof window === "undefined") return false;

  const searchResult = scrubCheckoutSearch(window.location.search);
  const hashResult = scrubCheckoutHash(window.location.hash);
  const capturedSuccess = searchResult.isSuccess || hashResult.isSuccess;

  if (capturedSuccess) {
    try {
      sessionStorage.setItem(PENDING_CHECKOUT_POLL_KEY, "success");
      sessionStorage.setItem(PENDING_CHECKOUT_ROUTE_KEY, "coach");
    } catch {
      // Ignore restricted sessionStorage
    }
  }

  if (searchResult.changed || hashResult.changed) {
    try {
      const nextUrl = `${window.location.pathname}${searchResult.cleanedSearch}${hashResult.cleanedHash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    } catch {
      // Ignore restricted history APIs
    }
  }

  return capturedSuccess;
}
