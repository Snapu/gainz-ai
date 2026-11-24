<script setup lang="ts">
import { Minus, Plus } from "@lucide/vue";
import {
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldRoot,
  type NumberFieldRootProps,
} from "reka-ui";
import { computed, type HTMLAttributes } from "vue";
import { uiPressClass } from "@/shared/presentation/components/ui/styles";
import { t } from "@/shared/presentation/i18n";
import { useLocale } from "@/shared/presentation/i18n/useLocale";
import { cn } from "@/shared/presentation/lib/utils";

interface Props extends NumberFieldRootProps {
  class?: HTMLAttributes["class"];
  label?: string;
  description?: string;
  layout?: "horizontal" | "cross";
  showRounding?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  layout: "horizontal",
  showRounding: true,
});
const modelValue = defineModel<number | null>();

const { bcp47Locale } = useLocale();

const numberFieldProps = computed(() => {
  const {
    class: _class,
    label: _label,
    description: _description,
    layout: _layout,
    showRounding: _showRounding,
    ...rest
  } = props;
  return rest;
});

const numberFormatter = computed(
  () =>
    new Intl.NumberFormat(props.locale || bcp47Locale.value, {
      useGrouping: false,
      maximumFractionDigits: 4,
    }),
);

const activeStep = computed(() => props.step ?? 1);
const formattedStep = computed(() => numberFormatter.value.format(activeStep.value));

const STEP_EPSILON = 1e-9;

function getDecimalPlaces(value: number): number {
  const str = value.toString();
  const dotIdx = str.indexOf(".");
  return dotIdx === -1 ? 0 : Math.min(10, str.length - dotIdx - 1);
}

const roundingTargets = computed(() => {
  if (!props.showRounding) {
    return { down: null as number | null, up: null as number | null };
  }

  const val = modelValue.value;
  const step = activeStep.value;
  if (val == null || !Number.isFinite(val) || step <= 0 || !Number.isFinite(step)) {
    return { down: null as number | null, up: null as number | null };
  }

  const quotient = val / step;
  if (Math.abs(quotient - Math.round(quotient)) < STEP_EPSILON) {
    return { down: null as number | null, up: null as number | null };
  }

  const decimals = getDecimalPlaces(step);
  let down: number | null = Number((Math.floor(quotient) * step).toFixed(decimals));
  let up: number | null = Number((Math.ceil(quotient) * step).toFixed(decimals));

  if (props.min != null) {
    down = Math.max(props.min, down);
  }
  if (props.max != null) {
    up = Math.min(props.max, up);
  }

  if (down >= val - STEP_EPSILON) {
    down = null;
  }
  if (up <= val + STEP_EPSILON) {
    up = null;
  }

  return { down, up };
});

const crossStepButtonClass = cn(
  "flex h-9 w-full cursor-pointer items-center justify-center text-xs font-bold tabular-nums text-muted-foreground transition-colors duration-200 hover:bg-white/10 hover:text-foreground active:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  uiPressClass,
);

const crossRoundButtonClass = cn(
  "flex h-full shrink-0 cursor-pointer items-center justify-center px-2.5 text-xs font-bold tabular-nums text-muted-foreground transition-colors duration-200 hover:bg-white/10 hover:text-foreground active:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  uiPressClass,
);

const formattedRoundDown = computed(() =>
  roundingTargets.value.down != null
    ? numberFormatter.value.format(roundingTargets.value.down)
    : "",
);
const formattedRoundUp = computed(() =>
  roundingTargets.value.up != null ? numberFormatter.value.format(roundingTargets.value.up) : "",
);
</script>

<template>
  <NumberFieldRoot
    v-bind="numberFieldProps"
    v-model="modelValue"
    :step-snapping="props.stepSnapping ?? false"
    :locale="props.locale || bcp47Locale"
    :class="cn('flex flex-col gap-2 w-full', props.class)"
  >
    <div
      v-if="label || $slots['label-trailing']"
      :class="cn('flex items-center justify-between gap-2', props.layout === 'cross' ? 'min-h-7' : 'min-h-5')"
    >
      <label v-if="label" class="text-micro text-muted-foreground/60 ml-1 truncate">{{
        label
      }}</label>
      <slot name="label-trailing" />
    </div>
    <div
      v-if="props.layout === 'cross'"
      class="flex w-full flex-col overflow-hidden rounded-xl border border-input/50 bg-white/5 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-primary/50 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:border-primary"
    >
      <NumberFieldIncrement
        data-testid="number-field-increment"
        :aria-label="t('common.increaseBy', { value: formattedStep })"
        :class="cn(crossStepButtonClass, 'border-b border-white/5')"
      >
        +{{ formattedStep }}
      </NumberFieldIncrement>
      <div class="flex h-12 w-full min-w-0 items-center">
        <button
          v-if="roundingTargets.down != null"
          type="button"
          data-testid="number-field-round-down"
          :disabled="props.disabled"
          :aria-label="t('common.roundDownTo', { value: formattedRoundDown })"
          :class="cn(crossRoundButtonClass, 'border-r border-white/5')"
          @click="modelValue = roundingTargets.down"
        >
          ↓{{ formattedRoundDown }}
        </button>
        <NumberFieldInput
          inputmode="decimal"
          class="flex-1 w-full min-w-0 p-0 text-center bg-transparent border-none text-2xl font-bold tabular-nums focus-visible:outline-none text-foreground"
        />
        <button
          v-if="roundingTargets.up != null"
          type="button"
          data-testid="number-field-round-up"
          :disabled="props.disabled"
          :aria-label="t('common.roundUpTo', { value: formattedRoundUp })"
          :class="cn(crossRoundButtonClass, 'border-l border-white/5')"
          @click="modelValue = roundingTargets.up"
        >
          ↑{{ formattedRoundUp }}
        </button>
      </div>
      <NumberFieldDecrement
        data-testid="number-field-decrement"
        :aria-label="t('common.decreaseBy', { value: formattedStep })"
        :class="cn(crossStepButtonClass, 'border-t border-white/5')"
      >
        -{{ formattedStep }}
      </NumberFieldDecrement>
    </div>
    <div
      v-else
      class="flex h-14 w-full items-center justify-between overflow-hidden rounded-xl border border-input/50 bg-white/5 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-primary/50 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:border-primary"
    >
      <NumberFieldDecrement
        data-testid="number-field-decrement"
        :class="cn(
          'z-10 flex h-full cursor-pointer items-center justify-center px-4 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50',
          uiPressClass
        )"
      >
        <Minus class="w-5 h-5" />
      </NumberFieldDecrement>
      <NumberFieldInput 
        inputmode="decimal"
        class="flex-1 w-full min-w-0 p-0 text-center bg-transparent border-none text-2xl font-bold tabular-nums focus-visible:outline-none text-foreground z-0" 
      />
      <NumberFieldIncrement
        data-testid="number-field-increment"
        :class="cn(
          'z-10 flex h-full cursor-pointer items-center justify-center px-4 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50',
          uiPressClass
        )"
      >
        <Plus class="w-5 h-5" />
      </NumberFieldIncrement>
    </div>
    <p v-if="description" class="text-xs text-muted-foreground ml-1">{{ description }}</p>
  </NumberFieldRoot>
</template>
