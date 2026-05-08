<script setup lang="ts">
import { uiSelectableItemClass } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import UiCard from "./ui/UiCard.vue";

export interface ClickableListItemMeta {
  label: string;
  tone?: "default" | "primary";
}

export interface ClickableListItem {
  id: string;
  title: string;
  description?: string;
  meta?: ClickableListItemMeta[];
}

interface Props {
  items: ClickableListItem[];
  class?: any;
  itemClass?: any;
  asCard?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  asCard: true,
});

const emit = defineEmits<(e: "select", item: ClickableListItem) => void>();
</script>

<template>
  <component
    :is="props.asCard ? UiCard : 'div'"
    :variant="props.asCard ? 'list' : undefined"
    class="overflow-hidden"
    :class="props.class"
  >
    <button
      v-for="item in props.items"
      :key="item.id"
      type="button"
      :class="cn(uiSelectableItemClass, props.itemClass)"
      @click="emit('select', item)"
    >
      <div class="flex w-full items-center justify-between gap-3">
        <h3 class="truncate pr-4 text-sm font-bold tracking-tight text-foreground">
          {{ item.title }}
        </h3>

        <div
          v-if="item.meta?.length"
          class="flex shrink-0 flex-wrap justify-end gap-3 text-xs font-semibold text-muted-foreground"
        >
          <span
            v-for="meta in item.meta"
            :key="meta.label"
            :class="meta.tone === 'primary' ? 'text-primary' : undefined"
          >
            {{ meta.label }}
          </span>
        </div>
      </div>

      <div v-if="item.description" class="mt-1.5 text-left text-sm italic text-muted-foreground/60">
        {{ item.description }}
      </div>
    </button>
  </component>
</template>