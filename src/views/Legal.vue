<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";
import { computed } from "vue";
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";

const props = defineProps<{ type: "privacy" | "impressum" }>();
const router = useRouter();

const title = computed(() => (props.type === "privacy" ? "Privacy Policy" : "Impressum"));
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <header class="flex items-center p-4 border-b border-white/5 bg-background/80 backdrop-blur-md sticky top-0">
      <Button variant="ghost" size="icon" @click="router.back()" class="shrink-0 -ml-2 mr-2">
        <ArrowLeft class="w-6 h-6" />
      </Button>
      <h1 class="text-xl font-bold truncate">{{ title }}</h1>
    </header>
    
    <main class="flex-1 p-6 text-foreground/80 space-y-6">
      <p>This is a placeholder for the {{ title }} document.</p>
    </main>
  </div>
</template>
