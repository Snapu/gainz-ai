const SENSITIVE_QUERY_PARAM = /([?&#](?:access_token|id_token|refresh_token|code|token)=)[^&#]*/gi;
const SENSITIVE_HEADER_KEY = /^(?:authorization|cookie|x-api-key|apikey)$/i;
const SENSITIVE_EXTRA_KEY =
  /^(?:access_token|id_token|refresh_token|authorization|cookie|x-api-key|apikey|token|code|coachingAdviceText|rawJson)$/i;

interface ScrubbableEvent {
  user?: unknown;
  request?: {
    headers?: Record<string, string>;
    url?: string;
    query_string?: unknown;
  };
  extra?: Record<string, unknown>;
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
}

function scrubSensitiveUrl(rawUrl: string): string {
  return rawUrl.replace(SENSITIVE_QUERY_PARAM, "$1[REDACTED]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrubArray(items: unknown[], keyPattern: RegExp, seen: WeakSet<object>): unknown[] {
  if (seen.has(items)) return items;
  seen.add(items);

  for (let i = 0; i < items.length; i += 1) {
    items[i] = scrubValue(items[i], keyPattern, seen);
  }
  return items;
}

function scrubValue(value: unknown, keyPattern: RegExp, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubSensitiveUrl(value);
  if (Array.isArray(value)) return scrubArray(value, keyPattern, seen);
  if (isRecord(value)) scrubRecordValues(value, keyPattern, seen);
  return value;
}

function scrubRecordValues(
  record: Record<string, unknown>,
  keyPattern: RegExp = SENSITIVE_EXTRA_KEY,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (seen.has(record)) return;
  seen.add(record);

  for (const key of Object.keys(record)) {
    if (keyPattern.test(key)) {
      delete record[key];
      continue;
    }
    record[key] = scrubValue(record[key], keyPattern, seen);
  }
}

function scrubRequest(request: NonNullable<ScrubbableEvent["request"]>): void {
  if (request.headers) {
    for (const key of Object.keys(request.headers)) {
      if (SENSITIVE_HEADER_KEY.test(key)) {
        delete request.headers[key];
      }
    }
  }
  if (typeof request.url === "string") {
    request.url = scrubSensitiveUrl(request.url);
  }
  if (typeof request.query_string === "string") {
    request.query_string = scrubSensitiveUrl(`?${request.query_string}`).slice(1);
  } else if (isRecord(request.query_string)) {
    scrubRecordValues(request.query_string, SENSITIVE_EXTRA_KEY);
  }
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user;

  if (event.request) {
    scrubRequest(event.request);
  }
  if (event.extra) {
    scrubRecordValues(event.extra);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.data) {
      scrubRecordValues(breadcrumb.data);
    }
  }

  return event;
}
