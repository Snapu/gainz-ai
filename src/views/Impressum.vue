<script setup lang="ts">
import { useRouter } from "vue-router";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import { t } from "@/shared/presentation/i18n";
import { useLocale } from "@/shared/presentation/i18n/useLocale";

const router = useRouter();
const { locale } = useLocale();
</script>

<template>
  <div class="h-full bg-background flex flex-col overflow-hidden">
    <AppHeader show-back :title="t('legal.impressumTitle')" class="shrink-0" @back="router.back()" />
    
    <main class="flex-1 overflow-y-auto overscroll-y-contain p-6 text-foreground/80 space-y-8 max-w-3xl mx-auto">
      <p
        v-if="locale === 'en'"
        class="rounded-xl bg-white/5 border border-white/5 p-3 text-xs text-muted-foreground"
      >
        {{ t("legal.impressumEnNotice") }}
      </p>
      <section class="space-y-4">
        <h2 class="text-2xl font-bold text-foreground">Impressum</h2>
        <p class="font-semibold">Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</p>
        
        <div class="bg-white/5 rounded-xl p-6 font-mono text-sm leading-relaxed border border-white/5">
          Sabahattin Giritli<br />
          Am Kesselhaus 28<br />
          80999 München<br />
          Deutschland<br /><br />
          E-Mail: app.gainz.ai@gmail.com
        </div>
      </section>

      <section class="space-y-4">
        <h3 class="text-lg font-semibold text-foreground">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:</h3>
        <p class="bg-white/5 rounded-xl p-4 border border-white/5">
          Sabahattin Giritli, Am Kesselhaus 28, 80999 München
        </p>
      </section>
      
      <section class="pt-8 text-sm space-y-4 italic border-t border-white/5">
        <p>
          Haftungshinweis: Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung 
          für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich 
          deren Betreiber verantwortlich.
        </p>
      </section>
    </main>
  </div>
</template>
