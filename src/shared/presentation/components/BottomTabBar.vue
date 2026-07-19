<script setup lang="ts">
import { Calendar, Home, LineChart, MessageSquare } from "@lucide/vue";
import { useRoute } from "vue-router";

const route = useRoute();

const tabs = [
  { name: "home", label: "Train", icon: Home },
  { name: "insights", label: "Insights", icon: LineChart },
  { name: "plan", label: "Plan", icon: Calendar },
  { name: "coach", label: "Coach", icon: MessageSquare },
];
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-white/5 pb-safe">
    <div class="flex items-center justify-around h-16 px-2">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="flex flex-col items-center justify-center w-full h-full text-muted-foreground transition-colors duration-200"
        :class="{ 'text-primary': route.name === tab.name }"
      >
        <component :is="tab.icon" class="w-6 h-6 mb-1" :class="{ 'stroke-[2.5]': route.name === tab.name }" />
        <span class="text-xs font-bold tracking-wide" :class="route.name === tab.name ? 'text-primary' : 'text-muted-foreground/60'">
          {{ tab.label }}
        </span>
      </router-link>
    </div>
  </nav>
</template>
