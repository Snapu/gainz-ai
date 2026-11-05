<script setup lang="ts">
import { useIntersectionObserver, useResizeObserver } from "@vueuse/core";
import { computed, onMounted, ref, watch } from "vue";

export interface ProgressionSetItem {
  weight?: number | null;
  reps?: number | null;
  duration?: number | null;
}

export interface ProgressionSessionItem {
  key: string;
  dateLabel: string;
  sets: ProgressionSetItem[];
}

interface Props {
  sessions: ProgressionSessionItem[];
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  color: "var(--color-primary)",
});

const scrollContainer = ref<HTMLElement | null>(null);

function scrollToLatest(behavior: ScrollBehavior = "instant") {
  const performScroll = () => {
    const el = scrollContainer.value;
    if (!el) return;
    const target = Math.max(0, el.scrollWidth - el.clientWidth);
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ left: target, behavior });
    } else {
      el.scrollLeft = target;
    }
  };

  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(() => {
      requestAnimationFrame(performScroll);
    });
  } else {
    performScroll();
  }
}

const sessionsSignature = computed(() => {
  return props.sessions.map((s) => `${s.key}:${s.sets?.length ?? 0}`).join("|");
});

onMounted(() => scrollToLatest("instant"));

watch(sessionsSignature, (newSig, oldSig) => {
  if (newSig !== oldSig) {
    scrollToLatest("instant");
  }
});

useIntersectionObserver(scrollContainer, ([entry]) => {
  if (entry?.isIntersecting) {
    scrollToLatest("instant");
  }
});

useResizeObserver(scrollContainer, () => {
  scrollToLatest("instant");
});

const validSessions = computed(() => {
  return props.sessions.filter((s) => Array.isArray(s.sets) && s.sets.length > 0);
});

const isWeightBased = computed(() => {
  return validSessions.value.some((s) => s.sets.some((set) => set.weight != null));
});

const isDurationBased = computed(() => {
  return (
    !isWeightBased.value &&
    validSessions.value.some((s) => s.sets.some((set) => set.duration != null))
  );
});

function getPrimaryValue(set: ProgressionSetItem): number {
  if (isWeightBased.value) return set.weight ?? 0;
  if (isDurationBased.value) return set.duration ?? 0;
  return set.reps ?? 0;
}

const allPrimaryValues = computed(() => {
  const vals: number[] = [];
  for (const s of validSessions.value) {
    for (const set of s.sets) {
      vals.push(getPrimaryValue(set));
    }
  }
  return vals;
});

const minVal = computed(() => {
  if (allPrimaryValues.value.length === 0) return 0;
  return Math.min(...allPrimaryValues.value);
});

const maxVal = computed(() => {
  if (allPrimaryValues.value.length === 0) return 1;
  return Math.max(...allPrimaryValues.value);
});

const range = computed(() => {
  const r = maxVal.value - minVal.value;
  return r > 0 ? r : 1;
});

// SVG dimensions & coordinates
const SVG_HEIGHT = 96;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 28;
const GRAPH_HEIGHT = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const BASELINE_Y = PADDING_TOP + GRAPH_HEIGHT;

function getY(val: number): number {
  if (range.value === 0 || maxVal.value === minVal.value) {
    return PADDING_TOP + GRAPH_HEIGHT / 2;
  }
  return PADDING_TOP + GRAPH_HEIGHT - ((val - minVal.value) / range.value) * GRAPH_HEIGHT;
}

const SET_GAP = 34;
const SESSION_GAP = 30;
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;

interface RenderedPoint {
  x: number;
  y: number;
  val: number;
  set: ProgressionSetItem;
}

interface RenderedSession {
  key: string;
  dateLabel: string;
  points: RenderedPoint[];
  startX: number;
  endX: number;
  centerX: number;
  linePath: string;
  fillPath: string;
  dividerX?: number;
}

const layout = computed(() => {
  if (!validSessions.value.length) return { sessions: [], totalWidth: 200, bridges: [] };

  let currentX = MARGIN_LEFT;
  const sessions: RenderedSession[] = [];
  const bridges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (let sIdx = 0; sIdx < validSessions.value.length; sIdx++) {
    const session = validSessions.value[sIdx];
    const startX = currentX;

    const points: RenderedPoint[] = session.sets.map((set, setIdx) => {
      const x = currentX;
      const val = getPrimaryValue(set);
      const y = getY(val);
      if (setIdx < session.sets.length - 1) {
        currentX += SET_GAP;
      }
      return { x, y, val, set };
    });

    const endX = currentX;
    const centerX = (startX + endX) / 2;

    // Line & Area fill paths for intra-session
    let linePath = "";
    let fillPath = "";
    if (points.length > 1) {
      linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      fillPath = `${linePath} L ${points[points.length - 1].x} ${BASELINE_Y} L ${points[0].x} ${BASELINE_Y} Z`;
    }

    let dividerX: number | undefined;
    if (sIdx < validSessions.value.length - 1) {
      const nextSession = validSessions.value[sIdx + 1];
      const lastPoint = points[points.length - 1];

      if (lastPoint && nextSession?.sets?.[0]) {
        const nextSetFirstVal = getPrimaryValue(nextSession.sets[0]);
        const nextSetFirstX = currentX + SESSION_GAP;
        const nextSetFirstY = getY(nextSetFirstVal);

        // Bridge line connecting this session's last set to next session's first set
        bridges.push({
          x1: lastPoint.x,
          y1: lastPoint.y,
          x2: nextSetFirstX,
          y2: nextSetFirstY,
        });

        dividerX = (lastPoint.x + nextSetFirstX) / 2;
        currentX += SESSION_GAP;
      }
    }

    sessions.push({
      key: session.key,
      dateLabel: session.dateLabel,
      points,
      startX,
      endX,
      centerX,
      linePath,
      fillPath,
      dividerX,
    });
  }

  const totalWidth = Math.max(currentX + MARGIN_RIGHT, 100);

  return { sessions, totalWidth, bridges };
});
</script>

<template>
  <div 
    ref="scrollContainer"
    class="w-full overflow-x-auto no-scrollbar overscroll-x-contain relative"
  >
    <svg 
      :viewBox="`0 0 ${layout.totalWidth} ${SVG_HEIGHT}`"
      :style="{ width: `${layout.totalWidth}px`, height: `${SVG_HEIGHT}px` }"
      class="overflow-visible select-none shrink-0"
    >
      <!-- 1. Inter-session dividers & bridges -->
      <template v-for="bridge in layout.bridges" :key="`${bridge.x1}-${bridge.x2}`">
        <line
          :x1="bridge.x1"
          :y1="bridge.y1"
          :x2="bridge.x2"
          :y2="bridge.y2"
          :stroke="color"
          stroke-width="1.5"
          stroke-dasharray="3 3"
          stroke-linecap="round"
          class="opacity-30"
        />
      </template>

      <!-- 2. Session rendering -->
      <template v-for="session in layout.sessions" :key="session.key">
        <!-- Session vertical divider (in the gap) -->
        <line
          v-if="session.dividerX != null"
          :x1="session.dividerX"
          :y1="PADDING_TOP - 8"
          :x2="session.dividerX"
          :y2="SVG_HEIGHT - 16"
          stroke="white"
          stroke-opacity="0.08"
          stroke-dasharray="2 3"
        />

        <!-- Area fill under sets -->
        <path
          v-if="session.fillPath"
          :d="session.fillPath"
          fill="currentColor"
          class="text-primary/10"
        />

        <!-- Solid curve connecting sets in this session -->
        <path
          v-if="session.linePath"
          :d="session.linePath"
          fill="none"
          :stroke="color"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Set Points & Labels -->
        <template v-for="(p, pIdx) in session.points" :key="pIdx">
          <!-- Outer subtle glow circle -->
          <circle :cx="p.x" :cy="p.y" r="5" fill="currentColor" class="text-primary/20" />
          <!-- Inner solid point -->
          <circle :cx="p.x" :cy="p.y" r="3" class="fill-primary" />

          <!-- Value on top of point (Weight / Duration / Reps) -->
          <text
            :x="p.x"
            :y="p.y - 8"
            text-anchor="middle"
            class="text-[10px] font-bold tabular-nums fill-foreground"
          >
            {{ p.val }}
          </text>

          <!-- Rep count under point (when weight-based) -->
          <text
            v-if="isWeightBased && p.set.reps != null"
            :x="p.x"
            :y="p.y + 14"
            text-anchor="middle"
            class="text-[9px] font-semibold tabular-nums fill-muted-foreground/80"
          >
            {{ p.set.reps }}
          </text>
        </template>

        <!-- Session Date Label -->
        <text
          :x="session.centerX"
          :y="SVG_HEIGHT - 4"
          text-anchor="middle"
          class="text-[9px] font-bold fill-muted-foreground/50 tracking-wider uppercase"
        >
          {{ session.dateLabel }}
        </text>
      </template>
    </svg>
  </div>
</template>
