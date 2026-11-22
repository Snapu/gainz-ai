<script setup lang="ts">
import { computed } from "vue";
import { t } from "@/shared/presentation/i18n";

const props = withDefaults(
  defineProps<{
    id?: string;
  }>(),
  {
    id: "legal-consent",
  },
);

const model = defineModel<boolean>({ required: true });

const detailId = computed(() => `${props.id}-detail`);
</script>

<template>
  <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
    <input
      :id="id"
      v-model="model"
      type="checkbox"
      :aria-describedby="detailId"
      class="mt-0.5 h-5 w-5 shrink-0 accent-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    />
    <div class="space-y-2 text-xs font-medium text-foreground/85 leading-relaxed">
      <label :for="id" class="block cursor-pointer">
        {{ t("legal.consent.checkboxStart") }}<RouterLink
          to="/terms"
          class="text-primary font-semibold hover:underline"
          @click.stop
          >{{ t("legal.consent.termsLink") }}</RouterLink
        >{{ t("legal.consent.and") }}<RouterLink
          to="/privacy"
          class="text-primary font-semibold hover:underline"
          @click.stop
          >{{ t("legal.consent.privacyLink") }}</RouterLink
        >{{ t("legal.consent.checkboxEnd") }}
      </label>
      <p :id="detailId" class="text-muted-foreground leading-relaxed">
        {{ t("legal.consent.consentDetail") }}
      </p>
    </div>
  </div>
</template>
