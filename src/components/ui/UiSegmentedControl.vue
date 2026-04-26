<script setup lang="ts" generic="T extends string | number">
type Option = {
  id: T;
  label: string;
};

defineProps<{
  options: readonly Option[];
  modelValue: T;
}>();

defineEmits<(e: "update:modelValue", value: T) => void>();
</script>

<template>
  <div class="flex items-center gap-1 bg-white/5 rounded-[1.25rem] p-1 w-full">
    <button
      v-for="option in options"
      :key="option.id"
      class="flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 active:scale-[0.97] select-none"
      :class="modelValue === option.id
        ? 'bg-white/10 text-white shadow-[0_2px_10px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.15)] border border-white/10'
        : 'text-muted-foreground hover:text-foreground border border-transparent'"
      @click="$emit('update:modelValue', option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
