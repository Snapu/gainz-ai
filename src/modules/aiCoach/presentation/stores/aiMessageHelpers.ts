import type { PreviousAiMessage } from "@/modules/aiCoach/application";

interface AiMessageLike {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sessionId: string;
  logsCount: number;
  logsChecksum?: string;
}

export function toPreviousAiMessages(messages: AiMessageLike[]): PreviousAiMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    sessionId: message.sessionId,
    timestamp: message.timestamp.toISOString(),
    logsCount: message.logsCount,
    logsChecksum: message.logsChecksum,
  }));
}

export function createAiUserPlaceholder(
  sessionId: string,
  logsCount: number,
  logsChecksum?: string,
): AiMessageLike {
  return {
    id: `${Date.now()}-user`,
    role: "user",
    content: "AI request",
    timestamp: new Date(),
    sessionId,
    logsCount,
    logsChecksum,
  };
}

export function createAiAssistantMessage(
  sessionId: string,
  logsCount: number,
  responseText: string,
  logsChecksum?: string,
): AiMessageLike {
  return {
    id: `${Date.now()}-assistant`,
    role: "assistant",
    content: responseText,
    timestamp: new Date(),
    sessionId,
    logsCount,
    logsChecksum,
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
