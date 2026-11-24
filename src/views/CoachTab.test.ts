import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, ref } from "vue";
import type {
  ChatBubbleMessage,
  QuickPromptItem,
} from "@/modules/aiCoach/presentation/composables/useCoachChatViewModel";

const mockViewModel = {
  isDev: false,
  isLoading: ref(false),
  streamingCoachMessage: ref(""),
  userQuestion: ref(""),
  openScratchpads: ref<string[]>([]),
  openRequestPayloads: ref<string[]>([]),
  scrollContainerRef: ref<HTMLElement | null>(null),
  chatMessages: ref<ChatBubbleMessage[]>([
    {
      id: "c1",
      role: "coach",
      content: "Train Bench Press 3x8 today.",
      timestamp: "2026-11-15T10:00:00.000Z",
      formattedTime: "10:00",
      scratchpad: "Balanced Chest fatigue and progressive overload.",
      requestPayload: "# session\ndate: 2026-11-15\nSECRET PROMPT",
      recommendedWorkout: undefined,
      suggestedFollowUps: undefined,
    },
  ]),
  quickPrompts: ref<QuickPromptItem[]>([]),
  isKeyboardVisible: ref(false),
  handleAskQuestion: vi.fn(),
  applyQuickPrompt: vi.fn(),
  toggleScratchpad: vi.fn(),
  togglePayload: vi.fn(),
  copyPayload: vi.fn(),
  navigateToTrainTab: vi.fn(),
  renderMarkdown: vi.fn((text: string) => text),
};

vi.mock("@/modules/aiCoach/presentation", () => ({
  useCoachChatViewModel: () => mockViewModel,
  WorkoutExerciseList: defineComponent({ template: "<div />" }),
}));

import CoachTab from "./CoachTab.vue";

function mountCoachTab(): { host: HTMLDivElement; text: string; unmount: () => void } {
  const host = document.createElement("div");
  const app = createApp(CoachTab);
  app.component("UiBadge", defineComponent({ template: "<span><slot /></span>" }));
  app.component("UiButton", defineComponent({ template: "<button><slot /></button>" }));
  app.component("UiCard", defineComponent({ template: "<div><slot /></div>" }));
  app.component("UiTelemetryLoader", defineComponent({ template: "<div />" }));
  app.component("UiTextarea", defineComponent({ template: "<textarea />" }));
  app.mount(host);
  return {
    host,
    text: host.textContent ?? "",
    unmount: () => app.unmount(),
  };
}

describe("CoachTab.vue", () => {
  it("hides Debug Data completely when isDev is false while preserving Coach's Rationale", () => {
    mockViewModel.isDev = false;
    const mounted = mountCoachTab();
    try {
      expect(mounted.text).toContain("Coach's Rationale");
      expect(mounted.text).not.toContain("Debug Data");
      expect(mounted.text).not.toContain("Sent Prompt Payload");
    } finally {
      mounted.unmount();
    }
  });

  it("renders Debug Data toggle in dev mode when requestPayload is present", () => {
    mockViewModel.isDev = true;
    const mounted = mountCoachTab();
    try {
      expect(mounted.text).toContain("Debug Data");
    } finally {
      mounted.unmount();
    }
  });

  it("renders live streamingCoachMessage via renderMarkdown, scopes live region to status footer, and hides typing indicator while streaming", () => {
    mockViewModel.renderMarkdown.mockClear();
    mockViewModel.isLoading.value = true;
    mockViewModel.streamingCoachMessage.value = "Streaming coaching tip right now.";
    const mounted = mountCoachTab();
    try {
      expect(mockViewModel.renderMarkdown).toHaveBeenCalledWith(
        "Streaming coaching tip right now.",
      );
      expect(mounted.text).toContain("Streaming coaching tip right now.");
      expect(mounted.text).toContain("Finalizing coaching response...");
      expect(mounted.text).not.toContain("Coach is thinking...");

      const statusEl = mounted.host.querySelector('[role="status"]');
      expect(statusEl).not.toBeNull();
      expect(statusEl?.getAttribute("aria-live")).toBe("polite");
      expect(statusEl?.textContent).toContain("Finalizing coaching response...");
      expect(statusEl?.querySelector(".coach-content")).toBeNull();
    } finally {
      mockViewModel.isLoading.value = false;
      mockViewModel.streamingCoachMessage.value = "";
      mounted.unmount();
    }
  });

  it("displays the AI & medical disclaimer when keyboard is hidden", () => {
    mockViewModel.isKeyboardVisible.value = false;
    const mounted = mountCoachTab();
    try {
      expect(mounted.text).toContain(
        "AI-generated advice may contain errors and does not replace medical guidance. Train at your own risk.",
      );
    } finally {
      mounted.unmount();
    }
  });

  it("renders quick response chips inside the scrollable main area on the latest coach response rather than the bottom input sheet", () => {
    const initialMessages = mockViewModel.chatMessages.value;
    mockViewModel.chatMessages.value = [
      ...initialMessages,
      {
        id: "u1",
        role: "user" as const,
        content: "Can we adjust volume?",
        timestamp: "2026-11-15T10:01:00.000Z",
        formattedTime: "10:01",
      },
      {
        id: "c2",
        role: "coach" as const,
        content: "Reduced bench volume to 2 sets.",
        timestamp: "2026-11-15T10:01:05.000Z",
        formattedTime: "10:01",
        scratchpad: null,
        requestPayload: null,
        recommendedWorkout: undefined,
        suggestedFollowUps: [{ label: "Warmup Protocol", prompt: "Show warmup sets" }],
      },
    ];
    mockViewModel.quickPrompts.value = [
      { id: "followup-c2-0", label: "Warmup Protocol", prompt: "Show warmup sets" },
    ];
    mockViewModel.isKeyboardVisible.value = true;
    mockViewModel.userQuestion.value = "Draft question";
    mockViewModel.applyQuickPrompt.mockClear();

    const mounted = mountCoachTab();
    try {
      const mainEl = mounted.host.querySelector("main");
      const bottomSheetEl = mounted.host.querySelector("main + div");
      const chipButtons = Array.from(
        mounted.host.querySelectorAll('button[aria-label="Show warmup sets"]'),
      );

      expect(chipButtons).toHaveLength(1);
      expect(mainEl?.contains(chipButtons[0])).toBe(true);
      expect(bottomSheetEl?.contains(chipButtons[0])).toBe(false);

      (chipButtons[0] as HTMLButtonElement).click();
      expect(mockViewModel.applyQuickPrompt).toHaveBeenCalledWith("Show warmup sets");
    } finally {
      mockViewModel.chatMessages.value = initialMessages;
      mockViewModel.quickPrompts.value = [];
      mockViewModel.isKeyboardVisible.value = false;
      mockViewModel.userQuestion.value = "";
      mounted.unmount();
    }
  });
});
