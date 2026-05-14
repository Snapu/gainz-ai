<script setup lang="ts">
import { X } from "@lucide/vue";
import {
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from "reka-ui";
import { useToast } from "@/shared/presentation/composables/useToast";

const { toasts, dismiss } = useToast();
</script>

<template>
  <ToastProvider>
    <slot />
    <ToastViewport class="fixed bottom-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]" />
    
    <ToastRoot
      v-for="t in toasts"
      :key="t.id"
      :duration="t.persistent ? Number.POSITIVE_INFINITY : (t.duration ?? 5000)"
      :type="t.persistent ? 'foreground' : 'foreground'"
      @update:open="!$event && dismiss(t.id!)"
      :class="[
        'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-xl border p-5 shadow-2xl transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--reka-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--reka-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full mt-4 backdrop-blur-xl',
        t.variant === 'destructive' 
          ? 'destructive border-destructive bg-destructive/90 text-destructive-foreground'
          : 'border-white/10 bg-card/95 text-foreground/90'
      ]"
    >
      <div class="grid gap-1">
        <div v-if="t.title" class="flex items-center justify-between gap-2">
          <ToastTitle class="text-base font-bold text-foreground">
            {{ t.title }}
          </ToastTitle>
          <span v-if="t.countdown" class="text-xs font-mono text-foreground/60">
            {{ t.countdown.seconds }}s
          </span>
        </div>
        <ToastDescription v-if="t.description" class="text-sm opacity-90">
          {{ t.description }}
        </ToastDescription>
      </div>
      
      <ToastAction
        v-if="t.action"
        :alt-text="t.action.label"
        as-child
      >
        <button type="button"
          @click="t.action.onClick"
          class="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-4 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
        >
          {{ t.action.label }}
        </button>
      </ToastAction>
      
      <ToastClose class="absolute right-4 top-4 rounded-lg p-1.5 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 group-hover:opacity-100 bg-white/5">
        <X class="h-4 w-4" />
      </ToastClose>
    </ToastRoot>
  </ToastProvider>
</template>
