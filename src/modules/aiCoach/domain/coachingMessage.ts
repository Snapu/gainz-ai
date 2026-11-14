/**
 * Extracts a human-readable user question from message content, filtering out
 * internal automated request triggers and raw prompt context payloads.
 */
export function extractUserQuestion(content?: string | null): string | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (
    !trimmed ||
    trimmed === "AI request" ||
    trimmed === "Please generate a new 2-week mesocycle plan."
  ) {
    return null;
  }

  // Check if content is an assembled system prompt payload (which always starts with # session and metadata/sections)
  if (
    (trimmed.startsWith("# session\n") || trimmed.startsWith("# session\r\n")) &&
    (/(?:^|\r?\n)(?:date|mode|phase|status):/m.test(trimmed) ||
      /(?:^|\r?\n)# (?:workload|muscles|exercises|e1rm|today|program|events|history|logs|update|profile)/m.test(
        trimmed,
      ))
  ) {
    const match = trimmed.match(
      /(?:^|\r?\n)# question\r?\n([\s\S]*?)(?=(?:\r?\n){1,2}# (?:workload|muscles|exercises|e1rm|update|plan|profile|goals|today|program|events|history|logs|\d+d|all)(?:\r?\n|$)|$)/,
    );
    if (match?.[1]) {
      const q = match[1].trim();
      if (!q || q === "AI request" || q === "Please generate a new 2-week mesocycle plan.") {
        return null;
      }
      return q;
    }
    // Assembled prompt payload without an explicit user question (automated daily advice/session trigger)
    return null;
  }

  return trimmed;
}
