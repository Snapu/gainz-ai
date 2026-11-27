<script setup lang="ts">
import { Check, ChevronDown, Lock, Sparkles } from "@lucide/vue";
import { ref } from "vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import { t } from "@/shared/presentation/i18n";
import InviteCodeForm from "./InviteCodeForm.vue";

const showInviteForm = ref(false);
</script>

<template>
  <UiCard class="p-4 flex flex-col gap-4 shadow-sm">
    <div class="flex items-start justify-between gap-3">
      <div class="flex flex-col gap-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <Sparkles class="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <h3 class="text-sm font-bold text-foreground">{{ t("billing.upgradeTitle") }}</h3>
          <UiBadge variant="warning" class="uppercase tracking-wider">
            {{ t("billing.upgradeBadge") }}
          </UiBadge>
        </div>
        <p class="text-xs font-medium text-muted-foreground leading-relaxed">
          {{ t("billing.upgradeSubtitle") }}
        </p>
      </div>
    </div>

    <div class="px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
      <p class="text-sm font-bold tracking-tight">{{ t("billing.priceLabel") }}</p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
        <h4 class="text-micro text-primary">{{ t("billing.proHeading") }}</h4>
        <ul class="flex flex-col gap-2 text-xs font-medium text-foreground/90">
          <li class="flex items-start gap-2">
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.proFeatureCoach") }}</span>
          </li>
          <li class="flex items-start gap-2">
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.proFeaturePlan") }}</span>
          </li>
          <li class="flex items-start gap-2">
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.proFeatureTargets") }}</span>
          </li>
          <li class="flex items-start gap-2">
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.proFeatureChat") }}</span>
          </li>
          <li class="flex items-start gap-2">
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.proFeatureBriefings") }}</span>
          </li>
        </ul>
      </div>

      <div class="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
        <h4 class="text-micro text-emerald-400">{{ t("billing.freeHeading") }}</h4>
        <ul class="flex flex-col gap-2 text-xs font-medium text-foreground/80">
          <li class="flex items-start gap-2">
            <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.freeFeatureLog") }}</span>
          </li>
          <li class="flex items-start gap-2">
            <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.freeFeatureHistory") }}</span>
          </li>
          <li class="flex items-start gap-2">
            <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.freeFeatureTimer") }}</span>
          </li>
          <li class="flex items-start gap-2">
            <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.freeFeatureSheets") }}</span>
          </li>
          <li class="flex items-start gap-2">
            <Check class="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{{ t("billing.freeFeatureInsights") }}</span>
          </li>
        </ul>
      </div>
    </div>

    <slot name="actions" />

    <div class="border-t border-white/5 pt-3 flex flex-col gap-3">
      <button
        type="button"
        :aria-expanded="showInviteForm"
        aria-controls="upgrade-invite-form"
        class="flex items-center justify-between w-full rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer"
        @click="showInviteForm = !showInviteForm"
      >
        <span>{{ t("billing.inviteToggleLabel") }}</span>
        <ChevronDown
          :class="['w-4 h-4 transition-transform duration-200', showInviteForm && 'rotate-180']"
          aria-hidden="true"
        />
      </button>
      <div v-if="showInviteForm" id="upgrade-invite-form">
        <InviteCodeForm />
      </div>
    </div>

    <p class="flex items-start gap-2 text-xs font-medium text-muted-foreground/80 leading-relaxed">
      <Lock class="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/70" aria-hidden="true" />
      <span>{{ t("billing.billingNotice") }}</span>
    </p>
  </UiCard>
</template>
