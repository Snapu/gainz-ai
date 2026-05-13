import type { PreviousAiMessage } from "@/modules/aiCoach/application";

interface AiMessageLike {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sessionDate: string;
  logsCount: number;
}

export function shouldUseCachedAssistantResponse(
  lastMessage: AiMessageLike | undefined,
  todayLogsCount: number,
  todaySessionDate: string,
): boolean {
  return (
    lastMessage?.role === "assistant" &&
    lastMessage.logsCount === todayLogsCount &&
    lastMessage.sessionDate === todaySessionDate
  );
}

export function toPreviousAiMessages(messages: AiMessageLike[]): PreviousAiMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    sessionDate: message.sessionDate,
    timestamp: message.timestamp.toISOString(),
    logsCount: message.logsCount,
  }));
}

export function createAiUserPlaceholder(sessionDate: string, logsCount: number): AiMessageLike {
  return {
    id: `${Date.now()}-user`,
    role: "user",
    content: "AI request",
    timestamp: new Date(),
    sessionDate,
    logsCount,
  };
}

export function createAiAssistantMessage(
  sessionDate: string,
  logsCount: number,
  responseText: string,
): AiMessageLike {
  return {
    id: `${Date.now()}-assistant`,
    role: "assistant",
    content: responseText,
    timestamp: new Date(),
    sessionDate,
    logsCount,
  };
}

export function removeMessageById<T extends { id: string }>(messages: T[], messageId: string): T[] {
  return messages.filter((message) => message.id !== messageId);
}

export function replaceMessageContentById<T extends { id: string; content: string }>(
  messages: T[],
  messageId: string,
  content: string,
): T[] {
  return messages.map((message) => (message.id === messageId ? { ...message, content } : message));
}
