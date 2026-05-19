<script setup lang="ts" generic="T extends string | number">
type Option = {
  id: T;
  label: string;
};

const modelValue = defineModel<T>({ required: true });

const props = withDefaults(
  defineProps<{
    options: readonly Option[];
    variant?: "primary" | "secondary";
  }>(),
  {
    variant: "primary",
  },
);
</script>

<template>
  <div
    class="flex w-full items-center gap-1 rounded-xl p-1 transition-colors duration-200"
    :class="props.variant === 'secondary' ? 'bg-transparent' : 'bg-white/5'"
  >
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="flex-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :class="props.variant === 'secondary'
        ? (modelValue === option.id
            ? 'bg-primary/10 text-foreground border border-primary/40 shadow-sm'
            : 'bg-white/[0.03] text-muted-foreground border border-white/10 hover:bg-white/[0.06] hover:border-primary/30 hover:text-foreground')
        : (modelValue === option.id
            ? 'bg-white/10 text-foreground shadow-sm border border-white/10'
            : 'text-muted-foreground hover:bg-white/10 hover:text-foreground border border-transparent')"
      @click="modelValue = option.id"
    >
      {{ option.label }}
    </button>
  </div>
</template>
