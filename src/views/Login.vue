<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { useLocale } from "@/shared/presentation/i18n/useLocale";

const router = useRouter();
const authStore = useAuthStore();
const { toast } = useToast();
const { locale, setLocale } = useLocale();
const isLoggingIn = ref(false);

async function handleLogin() {
  isLoggingIn.value = true;
  try {
    const result = await authStore.login();
    result.match(
      () => {
        router.push("/loading");
      },
      (error) => {
        if (error === "missing-scopes") {
          toast({
            title: t("auth.missingPermissionsTitle"),
            description: t("auth.missingPermissionsDesc"),
            variant: "destructive",
          });
        } else {
          toast({
            title: t("auth.loginFailedTitle"),
            description: t("auth.loginFailedDesc"),
            variant: "destructive",
          });
        }
      },
    );
  } catch (err) {
    toast({
      title: t("common.error"),
      description: t("auth.unexpectedErrorDesc"),
      variant: "destructive",
    });
  } finally {
    isLoggingIn.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-between h-full bg-background p-6 pt-safe overflow-y-auto overscroll-y-contain">
    <div class="w-full max-w-md flex justify-end">
      <div
        role="group"
        :aria-label="t('nav.language')"
        class="inline-flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1"
      >
        <button
          type="button"
          @click="setLocale('en')"
          :aria-pressed="locale === 'en'"
          class="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          :class="locale === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'"
        >
          EN
        </button>
        <button
          type="button"
          @click="setLocale('de')"
          :aria-pressed="locale === 'de'"
          class="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          :class="locale === 'de' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'"
        >
          DE
        </button>
      </div>
    </div>

    <div class="flex-1 flex flex-col items-center justify-center w-full max-w-md gap-12">
      <div class="text-center space-y-4">
        <h1 class="text-6xl font-black tracking-tighter text-foreground">Gainz<span class="text-primary">AI</span></h1>
        <p class="text-lg text-muted-foreground font-medium">{{ t("auth.tagline") }}</p>
      </div>
      
      <UiButton 
        class="w-full text-lg h-16 rounded-xl" 
        @click="handleLogin" 
        :disabled="isLoggingIn"
      >
        {{ t("auth.signInGoogle") }}
      </UiButton>
    </div>
    
    <div class="pb-8 pt-4 flex gap-6 text-sm text-muted-foreground/60 font-medium">
      <RouterLink to="/privacy" class="hover:text-primary transition-colors">{{ t("nav.privacyPolicy") }}</RouterLink>
      <RouterLink to="/impressum" class="hover:text-primary transition-colors">{{ t("nav.impressum") }}</RouterLink>
    </div>
  </div>
</template>
