import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, KeepAlive } from "vue";
import { useAiOrchestratorStore, useCoachChatStore } from "@/modules/aiCoach/presentation";
import { extractUserQuestion, useCoachChatViewModel } from "./useCoachChatViewModel";

const mockPush = vi.fn();
const mockToast = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({
    toast: mockToast,
    dismiss: vi.fn(),
  }),
}));

describe("extractUserQuestion", () => {
  it("returns null for empty, undefined, or whitespace strings", () => {
    expect(extractUserQuestion(null)).toBeNull();
    expect(extractUserQuestion(undefined)).toBeNull();
    expect(extractUserQuestion("")).toBeNull();
    expect(extractUserQuestion("   \n\t  ")).toBeNull();
  });

  it("returns null for automated request triggers", () => {
    expect(extractUserQuestion("AI request")).toBeNull();
    expect(extractUserQuestion("Please generate a new 2-week mesocycle plan.")).toBeNull();
  });

  it("returns null for assembled prompt payloads without a user question section", () => {
    const dailyConsultationPayload = `# session
mode: execution
date: 2026-10-30
# workload
sets: 12
tonnage: 4800kg
# today
Bench Press: 3x8 @80kg`;

    expect(extractUserQuestion(dailyConsultationPayload)).toBeNull();
  });

  it("extracts clean question from an assembled prompt payload containing # question", () => {
    const payloadWithQuestion = `# session
mode: execution
# question
Can I swap dumbbell press for barbell bench press today?
# workload
sets: 12
# today
Bench Press: 3x8 @80kg`;

    expect(extractUserQuestion(payloadWithQuestion)).toBe(
      "Can I swap dumbbell press for barbell bench press today?",
    );
  });

  it("extracts clean question from CRLF assembled prompt payload", () => {
    const crlfPayload =
      "# session\r\nmode: execution\r\n# question\r\nCan I swap dumbbell press for barbell bench press today?\r\n# workload\r\nsets: 12";

    expect(extractUserQuestion(crlfPayload)).toBe(
      "Can I swap dumbbell press for barbell bench press today?",
    );
  });

  it("extracts multi-line user questions properly without trailing sections", () => {
    const multiLinePayload = `# session
mode: execution
# question
My left knee is feeling sore after squats.
What is a safe alternative exercise for leg press?
# workload
sets: 14`;

    expect(extractUserQuestion(multiLinePayload)).toBe(
      "My left knee is feeling sore after squats.\nWhat is a safe alternative exercise for leg press?",
    );
  });

  it("returns plain user question string as-is", () => {
    expect(extractUserQuestion("How much rest should I take between deadlifts?")).toBe(
      "How much rest should I take between deadlifts?",
    );
  });

  it("preserves user questions containing markdown headings or hash characters", () => {
    const questionWithHash = `Can you review my exercises:
# 1. Bench Press
# 2. Incline Dumbbell Press`;

    expect(extractUserQuestion(questionWithHash)).toBe(questionWithHash);
  });

  it("extracts questions containing markdown headers from prompt payloads without premature truncation", () => {
    const payloadWithMarkdownQuestion = `# session
mode: execution
# question
My left knee is feeling sore:
# Squats
What is a safe alternative exercise?
# workload
sets: 14`;

    expect(extractUserQuestion(payloadWithMarkdownQuestion)).toBe(
      "My left knee is feeling sore:\n# Squats\nWhat is a safe alternative exercise?",
    );
  });

  it("ignores automated plan generation requests inside prompt payloads", () => {
    const planPromptPayload = `# session
mode: planning
# question
Please generate a new 2-week mesocycle plan.
# profile
goal: build_muscle`;

    expect(extractUserQuestion(planPromptPayload)).toBeNull();
  });

  it("does not prematurely truncate user questions containing words matching section names", () => {
    const payloadWithGoalPhrase = `# session
mode: execution
# question
Can you evaluate my current approach:
# goals are focused on building shoulder strength
# workload
sets: 10`;

    expect(extractUserQuestion(payloadWithGoalPhrase)).toBe(
      "Can you evaluate my current approach:\n# goals are focused on building shoulder strength",
    );
  });

  it("preserves genuine user questions that happen to begin with solitary '# session'", () => {
    const questionWithSessionHeading = "# session\nCan I substitute incline dumbbell press today?";
    expect(extractUserQuestion(questionWithSessionHeading)).toBe(
      "# session\nCan I substitute incline dumbbell press today?",
    );
  });
});

describe("useCoachChatViewModel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("defaults to empty quick prompt chips when no LLM follow-ups exist", () => {
    const vm = useCoachChatViewModel();
    expect(vm.quickPrompts.value).toEqual([]);
  });

  it("exposes reactive isLoading matching chatStore", () => {
    const vm = useCoachChatViewModel();
    expect(vm.isLoading.value).toBe(false);
  });

  it("filters automated trigger messages from chatMessages while including real user questions and coach advice", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    // 1. Automated daily consultation request (should be filtered out from bubbles)
    chatStore.addMessage({
      id: "msg-1",
      role: "user",
      sessionId: "session-1",
      logsCount: 0,
      content: "# session\nmode: execution\n# workload\nsets: 10",
      timestamp: "2026-10-30T10:00:00.000Z",
    });

    // 2. Coach response to daily advice
    chatStore.addMessage({
      id: "msg-2",
      role: "coach",
      sessionId: "session-1",
      logsCount: 0,
      content: JSON.stringify({
        coachMessage: "Focus on controlled eccentrics today.",
        scratchpad: "User has high fatigue.",
      }),
      timestamp: "2026-10-30T10:00:05.000Z",
    });

    // 3. User asks an explicit question (stored as prompt payload after response)
    chatStore.addMessage({
      id: "msg-3",
      role: "user",
      sessionId: "session-1",
      logsCount: 0,
      content:
        "# session\nmode: execution\n# question\nCan I swap dumbbell press?\n# workload\nsets: 10",
      timestamp: "2026-10-30T10:05:00.000Z",
    });

    // 4. Coach response to user question
    chatStore.addMessage({
      id: "msg-4",
      role: "coach",
      sessionId: "session-1",
      logsCount: 0,
      content: JSON.stringify({
        coachMessage: "Yes, incline dumbbell press is a great substitute.",
      }),
      timestamp: "2026-10-30T10:05:08.000Z",
    });

    const bubbles = vm.chatMessages.value;
    expect(bubbles).toHaveLength(3);

    // Bubble 1: Coach daily advice (msg-1 is filtered out)
    expect(bubbles[0]?.role).toBe("coach");
    expect(bubbles[0]?.content).toBe("Focus on controlled eccentrics today.");
    expect(bubbles[0]?.scratchpad).toBe("User has high fatigue.");

    // Bubble 2: Extracted user question
    expect(bubbles[1]?.role).toBe("user");
    expect(bubbles[1]?.content).toBe("Can I swap dumbbell press?");

    // Bubble 3: Coach answer
    expect(bubbles[2]?.role).toBe("coach");
    expect(bubbles[2]?.content).toBe("Yes, incline dumbbell press is a great substitute.");
    expect(bubbles[2]?.requestPayload).toBe(
      "# session\nmode: execution\n# question\nCan I swap dumbbell press?\n# workload\nsets: 10",
    );
  });

  it("does not attach requestPayload when user message is plain text without a system payload", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    chatStore.addMessage({
      id: "u1",
      role: "user",
      sessionId: "session-1",
      logsCount: 0,
      content: "Can I swap bench press?",
      timestamp: "2026-10-30T10:00:00.000Z",
    });

    chatStore.addMessage({
      id: "c1",
      role: "coach",
      sessionId: "session-1",
      logsCount: 0,
      content: JSON.stringify({ coachMessage: "Sure, dumbbell press works." }),
      timestamp: "2026-10-30T10:00:05.000Z",
    });

    const bubbles = vm.chatMessages.value;
    expect(bubbles).toHaveLength(2);
    expect(bubbles[1]?.requestPayload).toBeNull();
  });

  it("toggles openScratchpads and openRequestPayloads correctly", () => {
    const vm = useCoachChatViewModel();

    expect(vm.openScratchpads.value).toEqual([]);
    vm.toggleScratchpad("msg-1");
    expect(vm.openScratchpads.value).toEqual(["msg-1"]);
    vm.toggleScratchpad("msg-1");
    expect(vm.openScratchpads.value).toEqual([]);

    expect(vm.openRequestPayloads.value).toEqual([]);
    vm.togglePayload("msg-2");
    expect(vm.openRequestPayloads.value).toEqual(["msg-2"]);
    vm.togglePayload("msg-2");
    expect(vm.openRequestPayloads.value).toEqual([]);
  });

  it("handles user questions and manages loading/error state", async () => {
    const orchestratorStore = useAiOrchestratorStore();
    const vm = useCoachChatViewModel();

    const requestSpy = vi
      .spyOn(orchestratorStore, "requestAdvice")
      .mockReturnValue(okAsync(undefined));

    vm.userQuestion.value = "   ";
    vm.handleAskQuestion();
    expect(requestSpy).not.toHaveBeenCalled();

    vm.userQuestion.value = "Can I train today?";
    vm.handleAskQuestion();

    expect(requestSpy).toHaveBeenCalledWith("Can I train today?");
    expect(vm.userQuestion.value).toBe("");

    // Error recovery restores the user question
    requestSpy.mockReturnValue(errAsync("coaching-request-failed"));
    vm.userQuestion.value = "Will this cause overtraining?";
    vm.handleAskQuestion();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vm.userQuestion.value).toBe("Will this cause overtraining?");
    expect(mockToast).toHaveBeenCalled();
  });

  it("prefills userQuestion when quick prompt is applied without auto-sending", () => {
    const orchestratorStore = useAiOrchestratorStore();
    const vm = useCoachChatViewModel();

    const requestSpy = vi
      .spyOn(orchestratorStore, "requestAdvice")
      .mockReturnValue(okAsync(undefined));

    vm.applyQuickPrompt("Swap bench press for dumbbell press");
    expect(vm.userQuestion.value).toBe("Swap bench press for dumbbell press");
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("does not overwrite userQuestion when applyQuickPrompt is called while loading", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    chatStore.isLoading = true;
    vm.userQuestion.value = "Current text";
    vm.applyQuickPrompt("New prompt");
    expect(vm.userQuestion.value).toBe("Current text");
  });

  it("dynamically updates quickPrompts from latest coach advice suggestedFollowUps", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    // Initial state: empty when no suggestedFollowUps provided by LLM
    expect(vm.quickPrompts.value).toEqual([]);

    // Coach message with AI-generated suggestedFollowUps arrives
    chatStore.messages = [
      {
        id: "msg-1",
        role: "coach",
        timestamp: "2026-10-31T10:00:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: JSON.stringify({
          coachMessage: "Here is your push workout for today.",
          suggestedFollowUps: [
            {
              label: "Swap Incline Dumbbells",
              prompt: "Can we swap Incline Dumbbell Bench for an incline machine press?",
            },
            {
              label: "Warmup Protocol",
              prompt: "How many warmup sets should I do before the first working set?",
            },
            {
              label: "Condense to 30m",
              prompt:
                "I only have 30 minutes to train today. How should I condense today's workout?",
            },
          ],
        }),
      },
    ];

    expect(vm.quickPrompts.value).toHaveLength(3);
    expect(vm.quickPrompts.value[0].label).toBe("Swap Incline Dumbbells");
    expect(vm.quickPrompts.value[0].prompt).toBe(
      "Can we swap Incline Dumbbell Bench for an incline machine press?",
    );
    expect(vm.quickPrompts.value[1].label).toBe("Warmup Protocol");
    expect(vm.quickPrompts.value[2].label).toBe("Condense to 30m");
  });

  it("deduplicates suggested follow-ups by prompt and ignores whitespace-only items", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    chatStore.messages = [
      {
        id: "msg-dup",
        role: "coach",
        timestamp: "2026-10-31T10:00:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: JSON.stringify({
          coachMessage: "Here is your workout.",
          suggestedFollowUps: [
            { label: "Swap Bench", prompt: "Can we swap bench for dumbbells?" },
            { label: "Swap Bench Again", prompt: "Can we swap bench for dumbbells?" },
            { label: "   ", prompt: "Blank label prompt" },
            { label: "Valid Label", prompt: "   " },
            { label: "Warmup Sets", prompt: "How should I structure warmup sets?" },
          ],
        }),
      },
    ];

    expect(vm.quickPrompts.value).toHaveLength(2);
    expect(vm.quickPrompts.value[0].label).toBe("Swap Bench");
    expect(vm.quickPrompts.value[1].label).toBe("Warmup Sets");
  });

  it("deduplicates follow-ups by label and caps at 4 items", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    chatStore.messages = [
      {
        id: "msg-many",
        role: "coach",
        timestamp: "2026-10-31T10:00:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: JSON.stringify({
          coachMessage: "Here is your workout.",
          suggestedFollowUps: [
            { label: "Swap Bench", prompt: "Prompt A" },
            { label: "swap bench", prompt: "Prompt B" },
            { label: "Warmup", prompt: "Prompt C" },
            { label: "Deload", prompt: "Prompt D" },
            { label: "Time", prompt: "Prompt E" },
            { label: "Nutrition", prompt: "Prompt F" },
          ],
        }),
      },
    ];

    expect(vm.quickPrompts.value).toHaveLength(4);
    expect(vm.quickPrompts.value.map((qp) => qp.label)).toEqual([
      "Swap Bench",
      "Warmup",
      "Deload",
      "Time",
    ]);
  });

  it("does not resurrect stale follow-ups from older coach messages when latest coach message omits them", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    chatStore.messages = [
      {
        id: "msg-1",
        role: "coach",
        timestamp: "2026-10-31T10:00:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: JSON.stringify({
          coachMessage: "First workout advice.",
          suggestedFollowUps: [{ label: "Swap Bench", prompt: "Can we swap bench for dumbbells?" }],
        }),
      },
      {
        id: "msg-2",
        role: "user",
        timestamp: "2026-10-31T10:01:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: "Can we swap bench for dumbbells?",
      },
      {
        id: "msg-3",
        role: "coach",
        timestamp: "2026-10-31T10:02:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: JSON.stringify({
          coachMessage: "Sure! Use 24kg dumbbells for 3 sets of 10.",
          // No suggestedFollowUps provided here
        }),
      },
    ];

    // Must be empty, NOT resurrecting "Swap Bench" from msg-1
    expect(vm.quickPrompts.value).toEqual([]);
  });

  it("does not resurrect previous coach follow-ups when latest message is from the user", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    chatStore.messages = [
      {
        id: "msg-1",
        role: "coach",
        timestamp: "2026-10-31T10:00:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: JSON.stringify({
          coachMessage: "First workout advice.",
          suggestedFollowUps: [{ label: "Swap Bench", prompt: "Can we swap bench for dumbbells?" }],
        }),
      },
      {
        id: "msg-2",
        role: "user",
        timestamp: "2026-10-31T10:01:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: "Can we swap bench for dumbbells?",
      },
    ];

    // Must be empty because the user has already responded
    expect(vm.quickPrompts.value).toEqual([]);
  });

  it("returns empty quick prompts when coach message omits suggestedFollowUps (no fallback)", () => {
    const chatStore = useCoachChatStore();
    const vm = useCoachChatViewModel();

    chatStore.messages = [
      {
        id: "legacy-msg-1",
        role: "coach",
        timestamp: "2026-10-31T10:00:00Z",
        sessionId: "s1",
        logsCount: 0,
        content: JSON.stringify({
          coachMessage: "Great session yesterday. Today we focus on Quads and Calves.",
          recommendedWorkout: [
            { exerciseName: "Barbell Back Squat", targetSets: 4, targetReps: "6-8" },
            { exerciseName: "Leg Press", targetSets: 3, targetReps: "10-12" },
          ],
        }),
      },
    ];

    expect(vm.quickPrompts.value).toEqual([]);
  });

  it("navigates to train tab", () => {
    const vm = useCoachChatViewModel();

    vm.navigateToTrainTab();
    expect(mockPush).toHaveBeenCalledWith("/app/home");
  });

  it("copies prompt payloads using navigator clipboard", async () => {
    const vm = useCoachChatViewModel();

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    vm.copyPayload("# session\npayload");
    expect(writeTextMock).toHaveBeenCalledWith("# session\npayload");
    await Promise.resolve();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Copied!",
      }),
    );
  });

  it("only calls triggerEnsureSessionAdvice once on initial mount inside <KeepAlive>", () => {
    const orchestratorStore = useAiOrchestratorStore();
    const ensureAdviceSpy = vi
      .spyOn(orchestratorStore, "ensureSessionAdvice")
      .mockReturnValue(okAsync(undefined));

    const TestComponent = defineComponent({
      setup() {
        useCoachChatViewModel();
        return () => h("div");
      },
    });

    const ParentWithKeepAlive = defineComponent({
      setup() {
        return () => h(KeepAlive, null, { default: () => h(TestComponent) });
      },
    });

    const el = document.createElement("div");
    const app = createApp(ParentWithKeepAlive);
    app.mount(el);

    expect(ensureAdviceSpy).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
