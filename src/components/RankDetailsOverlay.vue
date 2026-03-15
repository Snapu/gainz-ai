<script setup lang="ts">
import { Flame, Sparkles, Trophy } from "lucide-vue-next";
import type { UserProgress } from "@/services/leveling";
import BottomSheet from "./ui/BottomSheet.vue";

defineProps<{
  progress: UserProgress;
}>();

const modelValue = defineModel<boolean>("open");
</script>

<template>
  <BottomSheet v-model:open="modelValue" :title="progress.title">
    <div class="flex flex-col items-center gap-8 py-4">
      <!-- Large Avatar Container -->
      <div class="relative group">
        <div class="absolute -inset-4 bg-primary/20 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-1000"></div>
        <div class="relative w-64 h-64 rounded-[3rem] overflow-hidden border-4 border-primary/20 shadow-2xl shadow-primary/20 transform hover:scale-105 transition-transform duration-500 bg-card/50">
          <img :src="progress.avatar" :alt="progress.title" class="w-full h-full object-cover" />
        </div>
        
        <!-- Animated Badge -->
        <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 rounded-2xl bg-primary text-primary-foreground font-black italic tracking-tighter shadow-xl shadow-primary/30 flex items-center gap-2 border-4 border-background">
          <Trophy class="w-4 h-4" />
          LEVEL {{ progress.level }}
        </div>
      </div>

      <!-- Description Section -->
      <div class="text-center space-y-6 px-2">
        <div class="space-y-2">
          <h3 class="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Lore & Motivation</h3>
          <p class="text-lg font-medium leading-relaxed italic text-foreground/90">
            "{{ progress.description }}"
          </p>
        </div>

        <!-- Level Stats Grid -->
        <div class="grid grid-cols-2 gap-4 w-full">
          <div class="p-4 rounded-3xl bg-white/5 border border-white/5 flex flex-col items-center gap-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Total XP</span>
            <span class="text-xl font-black italic tabular-nums">{{ progress.totalXP.toLocaleString() }}</span>
          </div>
          <div class="p-4 rounded-3xl bg-white/5 border border-white/5 flex flex-col items-center gap-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Momentum</span>
            <div class="flex items-center gap-1">
              <Flame class="w-4 h-4 text-orange-500" />
              <span class="text-xl font-black italic tabular-nums">{{ (progress.momentum * 100).toFixed(0) }}%</span>
            </div>
          </div>
        </div>

        <!-- Progress to Next Rank (if space allows or needed) -->
        <div class="p-6 rounded-3xl bg-linear-to-br from-primary/10 via-background to-background border border-primary/20 relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-3 opacity-20">
            <Sparkles class="w-8 h-8 text-primary" />
          </div>
          <div class="text-left relative z-10">
            <p class="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Elite Advice</p>
            <p class="text-sm font-medium text-muted-foreground leading-snug">
              {{ progress.level < 10 ? 'Keep showing up. These early levels are all about building the habit.' : 'Your consistency is legendary. Focus on maintaining your momentum to unlock elite ranks.' }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </BottomSheet>
</template>
