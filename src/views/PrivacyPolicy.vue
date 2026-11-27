<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import DeleteAccountSheet from "@/shared/presentation/components/DeleteAccountSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import { useLegalConsent } from "@/shared/presentation/composables/useLegalConsent";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { useLocale } from "@/shared/presentation/i18n/useLocale";

const router = useRouter();
const authStore = useAuthStore();
const { toast } = useToast();
const { locale, bcp47Locale } = useLocale();
const { consentRecord, hasLegalConsent, revokeLegalConsent } = useLegalConsent();
const isDeleteDialogOpen = ref(false);

const formattedConsentDate = computed(() => {
  if (!hasLegalConsent.value) return null;
  const acceptedAt = consentRecord.value?.acceptedAt;
  if (!acceptedAt) return null;
  const date = new Date(acceptedAt);
  if (Number.isNaN(date.getTime())) return acceptedAt;
  return new Intl.DateTimeFormat(bcp47Locale.value, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
});

const canWithdrawConsent = computed(() => authStore.isLoggedIn || consentRecord.value !== null);

function handleBack(): void {
  if (router.options?.history?.state?.back) {
    router.back();
  } else {
    void router.push("/");
  }
}

async function handleWithdrawConsent(): Promise<void> {
  revokeLegalConsent();
  authStore.logout();
  toast({
    title: t("legal.consent.withdrawnToastTitle"),
    description: t("legal.consent.withdrawnToastDesc"),
  });
  await router.push("/");
}
</script>

<template>
  <div class="h-full bg-background flex flex-col overflow-hidden pt-safe">
    <AppHeader show-back :title="t('legal.privacyTitle')" class="shrink-0" @back="handleBack" />

    <main
      class="flex-1 overflow-y-auto overscroll-y-contain px-6 pt-6 pb-safe text-foreground/80 font-medium"
    >
      <div class="max-w-3xl mx-auto space-y-8 pb-12">
        <template v-if="locale === 'de'">
          <section class="space-y-4">
            <h2 class="text-2xl font-bold text-foreground">Datenschutzerklärung</h2>
            <p class="text-sm italic">Letzte Aktualisierung: 27. November 2026</p>
            <p>
              Diese Datenschutzerklärung gilt für die Gainz AI App (nachfolgend „App“ oder
              „Anwendung“) und erläutert, welche personenbezogenen und freiwilligen
              gesundheitsbezogenen Daten wir erheben, wie wir diese verarbeiten und welche Rechte Sie
              haben.
            </p>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">1. Verantwortlicher</h2>
            <div class="bg-white/5 rounded-xl p-4 font-mono text-sm border border-white/5">
              Sabahattin Giritli<br />
              Am Kesselhaus 28<br />
              80999 München<br />
              Deutschland<br />
              E-Mail: app.gainz.ai@gmail.com
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">2. Erhobene Daten</h2>

            <div class="space-y-4">
              <h3 class="text-lg font-medium text-foreground">
                2.1 Daten, die Sie direkt bereitstellen
              </h3>
              <p>
                Im Rahmen der Nutzung der App werden folgende Daten lokal auf Ihrem Gerät und – soweit
                angegeben – in Ihrer eigenen Google-Drive-Tabelle gespeichert:
              </p>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground">Benutzerprofil (User Profile)</h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li><strong>Alter</strong> (age)</li>
                  <li><strong>Körpergröße in cm</strong> (heightCm)</li>
                  <li><strong>Gewicht in kg</strong> (weightKg)</li>
                  <li>
                    <strong>Fitnessziele</strong> (fitnessGoal): z. B. Muskelaufbau, Fettabbau,
                    Ausdauerverbesserung
                  </li>
                  <li>
                    <strong>Fitnesslevel</strong> (fitnessLevel): Einsteiger, Fortgeschritten,
                    Erfahren
                  </li>
                  <li><strong>Trainingstage pro Woche</strong> (workoutDaysPerWeek)</li>
                  <li><strong>Trainingsdauer in Minuten</strong> (workoutDurationMinutes)</li>
                  <li>
                    <strong>Trainingsort</strong> (workoutLocation): Fitnessstudio, Zuhause, Beides
                  </li>
                  <li>
                    <strong>Verfügbares Equipment</strong> (equipmentAccess): z. B. Kurzhanteln,
                    Klimmzugstange usw.
                  </li>
                  <li>
                    <strong>Freitextangaben</strong> (freeUserInput): freiwillige Zusatzinfos (z. B.
                    Verletzungen, Schwerpunkte, Einschränkungen)
                  </li>
                </ul>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground">Trainingsprotokoll (Exercise Logs)</h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li><strong>Übungsname</strong> (exerciseName)</li>
                  <li><strong>Datum und Uhrzeit</strong> der Übung (loggedAt)</li>
                  <li>
                    <strong>Sätze, Wiederholungen, Gewicht, Distanz, Dauer, RPE</strong> und weitere
                    trainingsrelevante Metriken
                  </li>
                  <li><strong>Eindeutige ID</strong> zur Identifikation des Eintrags</li>
                </ul>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground">
                  Auszeiten &amp; Gesundheitsereignisse (Rest &amp; Recovery Events)
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Ereignistyp &amp; Zeitraum</strong> (<code>events</code>): Ruhetag (Rest
                    Day), Krankheit (Sickness), Verletzung (Injury), Fasten (Fasting) oder eigene
                    Angaben inklusive Datumsbereich (ausschließlich lokal auf Ihrem Gerät gespeichert;
                    bei KI-Coaching-Anfragen an Google Gemini übermittelt, jedoch nicht in Google Drive
                    gespeichert)
                  </li>
                </ul>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground">
                  KI-Chat &amp; abgeleitete Trainingsanalysen
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Chat-Eingaben &amp; Verlauf</strong> (<code>question</code>,
                    <code>previousMessages</code>): Ihre Fragen an den KI-Coach und der aktuelle
                    Gesprächsverlauf
                  </li>
                  <li>
                    <strong>Trainingsanalysen &amp; Pläne</strong> (<code>insights</code>,
                    <code>trainingSummaries</code>, <code>activePlan</code>): berechnete
                    Belastungswerte (ACWR, e1RM, Volumen-Landmarks, Ermüdungs-/Deload-Status),
                    Monatszusammenfassungen sowie Ihr aktueller Trainingsplan
                  </li>
                </ul>
              </div>

              <div class="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm space-y-1">
                <p class="font-semibold text-foreground">
                  Hinweis zu Gesundheitsdaten (Art. 9 Abs. 1 DSGVO):
                </p>
                <p>
                  Sofern Sie unter „Pausen &amp; Auszeiten“ Angaben zu <strong>Krankheit</strong> oder
                  <strong>Verletzungen</strong> erfassen oder in Freitextfeldern
                  (<code>freeUserInput</code>, Coach-Chat) Hinweise zu Beschwerden bzw. Ihrer
                  Gesundheit machen, handelt es sich um besondere Kategorien personenbezogener Daten
                  (Gesundheitsdaten). Die Angabe ist vollständig freiwillig und wird ausschließlich
                  auf Grundlage Ihrer ausdrücklichen Einwilligung verarbeitet.
                </p>
              </div>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">2.2 Automatisch erhobene Daten</h3>
              <h4 class="font-medium text-foreground">Lokale und gerätespezifische Speicherung</h4>
              <p>
                Die App speichert Daten lokal auf Ihrem Gerät im Browser-/WebView-Speicher
                (<code>localStorage</code>) sowie für Authentifizierungstokens in nativen Apps im
                app-isolierten Gerätespeicher (<code>Capacitor Preferences</code> auf iOS/Android):
              </p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Browser-/WebView-<code>localStorage</code>:</strong> Benutzerprofildaten,
                  Trainingsprotokoll-Cache, Muskelklassifizierungen, Trainingspläne,
                  Auszeiten/Gesundheitsereignisse, Setup-Status, Spracheinstellung
                  (<code>gainz-locale</code>), Einwilligungsnachweis mit Zeitstempel und Version
                  (<code>gainz-legal-consent</code>), lokaler Billing-Status-Cache
                  (<code>billing:entitlement-v1</code>) sowie KI-Unterhaltungen (begrenzt auf 28 Tage)
                </li>
                <li>
                  <strong>Sitzungsstatus (<code>sessionStorage</code>):</strong> Kurzzeitige Marker
                  für ausstehende Einladungscodes und die Checkout-Rückkehr
                </li>
                <li>
                  <strong>OAuth-Tokens:</strong> Google OAuth Access Token, Refresh Token, ID Token
                  und Ablaufzeit (auf iOS/Android über <code>Capacitor Preferences</code>, im Web im
                  <code>localStorage</code>)
                </li>
              </ul>
            </div>

            <div class="space-y-2 border-l-2 border-primary/50 pl-4 py-2 bg-primary/5 rounded-r-xl">
              <h3 class="text-lg font-medium text-foreground">
                2.3 Speicherung und Backend-Verarbeitung
              </h3>
              <p>
                <strong>Wichtig:</strong> Ihre Trainingsprotokolle und Ihr Benutzerprofil werden nicht
                dauerhaft auf Servern des Anbieters gespeichert, sondern verbleiben:
              </p>
              <ul class="list-disc pl-5 space-y-1 font-medium">
                <li>lokal auf Ihrem Gerät (<code>localStorage</code> bzw. Capacitor Preferences)</li>
                <li>in Ihrer eigenen Google Drive Tabelle (Google Spreadsheets)</li>
              </ul>
              <p class="text-sm mt-2">
                Für den OAuth-Token-Austausch, die Weiterleitung von KI-Anfragen an Google Generative
                AI, die Verwaltung von Abonnement- und Tester-Zugängen
                (<code>user_subscriptions</code>, <code>invite_grants</code>), den pseudonymen
                Starter-Kontingent-Schutz (<code>HMAC-SHA256</code>-Digest mit max. 24 Monaten
                Inaktivitäts-Frist), monatlich aggregierte KI-Token-Kostenstatistiken, die
                Durchsetzung täglicher Nutzungslimits sowie zur kurzfristigen
                Verbindungs-Wiederherstellung bei Bildschirmsperre (max. 30 Minuten gültiger
                Zwischenspeicher) nutzt die App ein Backend auf Basis von <strong>Supabase</strong>
                (Hosting-Region EU Central / Frankfurt am Main, Deutschland).
              </p>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">
              3. Zweck und Rechtsgrundlage der Verarbeitung
            </h2>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                3.1 Bereitstellung der App-Funktionalität
              </h3>
              <p>
                <strong>Zweck:</strong> Verwaltung Ihres Fitnessprofils, Tracking von
                Trainingseinheiten, Erstellung personalisierter Trainingspläne und
                Belastungsanalysen
              </p>
              <p>
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung /
                Nutzungsbedingungen), Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) sowie bei freiwilligen
                Gesundheits- und Verletzungsangaben Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche
                Einwilligung)
              </p>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                3.2 KI-gestützte Trainingsempfehlungen
              </h3>
              <p>
                <strong>Zweck:</strong> Bereitstellung personalisierter Trainingsempfehlungen,
                Trainingspläne und Übungsklassifizierungen durch Google Generative AI
              </p>
              <p>
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a DSGVO (Einwilligung) sowie für
                freiwillige Angaben zu Krankheit, Verletzungen oder Einschränkungen Art. 9 Abs. 2
                lit. a DSGVO (ausdrückliche Einwilligung)
              </p>
              <p>
                <strong>Datenübermittlung:</strong> Ihre Profildaten, Trainingsprotokolle,
                Monatszusammenfassungen, Belastungs-/Ermüdungsanalysen, Auszeiten/Gesundheitsereignisse,
                Ihr aktiver Trainingsplan sowie der Chat-Verlauf werden über unser Supabase-Backend an
                Google Generative AI (Google LLC, USA) übertragen, um KI-basierte Empfehlungen zu
                generieren.
              </p>
              <p class="text-sm text-muted-foreground">
                Es findet keine automatisierte Entscheidungsfindung mit rechtlicher oder ähnlich
                erheblicher Wirkung im Sinne des Art. 22 DSGVO statt.
              </p>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                3.3 Google Drive Integration &amp; Scopes
              </h3>
              <p>
                <strong>Zweck:</strong> Speicherung und Synchronisation Ihrer Trainingsdaten in Ihrer
                eigenen Google Drive Tabelle
              </p>
              <p>
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)
              </p>
              <p class="font-medium">Erforderliche Berechtigungen (OAuth Scopes):</p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <code>https://www.googleapis.com/auth/drive.file</code>: Erstellen und Bearbeiten
                  ausschließlich von Dateien, die von Gainz AI erstellt oder durch den Nutzer
                  explizit mit der App geöffnet wurden (kein Vollzugriff auf Ihr Google Drive oder
                  fremde Dateien).
                </li>
                <li>
                  <code>openid</code>: Sichere Authentifizierung und kryptografische Validierung Ihres
                  Google-Kontos für das serverseitige Rate-Limiting.
                </li>
              </ul>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">4. Datenübermittlung an Dritte</h2>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">4.1 Sentry (Fehlerüberwachung)</h3>
              <p>
                Die App nutzt Sentry zur technischen Fehlerüberwachung und Stabilitätsverbesserung.
              </p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Anbieter:</strong> Functional Software, Inc., 45 Fremont Street, 8th Floor,
                  San Francisco, CA 94105, USA
                </li>
                <li><strong>Zweck:</strong> Erkennung und Behebung technischer Fehler</li>
                <li>
                  <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
                  Interesse an Fehleranalyse und App-Stabilität)
                </li>
                <li>
                  <strong>Datenstandort:</strong> EU (Deutschland – <code>ingest.de.sentry.io</code>)
                </li>
                <li>
                  <strong>Übermittelte Daten:</strong> Fehlermeldungen, Stack Traces,
                  Browser-/Geräteinformationen (User Agent), bereinigte HTTP-Request-URLs,
                  Konsolenmeldungen, Referrer-URL
                </li>
                <li>
                  <strong>Datensparsamkeit &amp; Scrubber:</strong> Das SDK übermittelt keine
                  Standard-PII (<code>sendDefaultPii</code> deaktiviert), kein Benutzerobjekt, keine
                  Cookies, keine E-Mail-Adressen, keine OAuth-Tokens/Query-Secrets und keine
                  KI-Antworttexte; eine Speicherung von IP-Adressen wird projektseitig unterbunden
                </li>
                <li>
                  <strong>Datenschutzerklärung:</strong>
                  <a
                    href="https://sentry.io/privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >https://sentry.io/privacy/</a
                  >
                </li>
              </ul>
            </div>

            <div class="space-y-4">
              <h3 class="text-lg font-medium text-foreground">4.2 Google LLC (Alphabet Inc.)</h3>
              <p>Die App nutzt folgende Google-Dienste:</p>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground underline decoration-primary/30">
                  Google OAuth 2.0 / Google Login
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Zweck:</strong> Authentifizierung und Autorisierung für Google Drive
                    Zugriff sowie Rate-Limiting
                  </li>
                  <li>
                    <strong>Übermittelte Daten:</strong> OAuth-Codes, Access/Refresh/ID Tokens,
                    Berechtigungsumfang (Scopes)
                  </li>
                  <li>
                    <strong>Datenschutzerklärung:</strong>
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                      >https://policies.google.com/privacy</a
                    >
                  </li>
                </ul>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground underline decoration-primary/30">
                  Google Drive / Google Spreadsheets
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li><strong>Zweck:</strong> Speicherung Ihrer Trainingsdaten</li>
                  <li>
                    <strong>Übermittelte Daten:</strong> Ihr Profil, Trainingsprotokolle,
                    Körpermaße, Monatszusammenfassungen und Deload-Status
                  </li>
                  <li><strong>Speicherort:</strong> Ihre eigene Google Drive Tabelle</li>
                  <li>
                    <strong>Kontrolle:</strong> Sie behalten die volle Kontrolle über diese Daten in
                    Ihrem Google Drive
                  </li>
                </ul>
                <div class="mt-3 p-3 bg-white/5 rounded-xl border border-white/5 text-xs space-y-1">
                  <p class="font-semibold text-foreground">Google API Limited Use Disclosure:</p>
                  <p>
                    Die Nutzung und Übertragung von Informationen, die Gainz AI über Google-APIs
                    erhält, an andere Apps erfolgt im Einklang mit der
                    <a
                      href="https://developers.google.com/terms/api-services-user-data-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                      >Google API Services User Data Policy</a
                    >, einschließlich der Anforderungen an die eingeschränkte Nutzung („Limited
                    Use“).
                  </p>
                  <p class="italic text-muted-foreground">
                    "Gainz AI's use and transfer to any other app of information received from Google
                    APIs will adhere to the Google API Services User Data Policy, including the
                    Limited Use requirements."
                  </p>
                </div>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground underline decoration-primary/30">
                  Google Generative AI (Gemini API)
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Zweck:</strong> KI-gestützte Trainingsempfehlungen, Trainingsplanung und
                    Übungsklassifizierung
                  </li>
                  <li>
                    <strong>Übermittelte Daten:</strong> Ihr Benutzerprofil (inkl. freiwilliger
                    Zusatzinfos), Ihre Trainingsprotokolle, Monatszusammenfassungen,
                    Belastungs-/Ermüdungsanalysen (ACWR, e1RM, Deload), Auszeiten &amp;
                    Gesundheitsereignisse (Ruhetage, Krankheit, Verletzungen, Fasten), Ihr aktiver
                    Trainingsplan, Ihre Chat-Fragen/Verlauf, Sprach-/Locale-Einstellungen und das
                    aktuelle Datum
                  </li>
                  <li>
                    <strong>Übertragungsweg:</strong> Anfragen werden über unser Supabase Backend
                    (Edge Functions) mit dem zentralen API-Schlüssel des Anbieters an die Gemini API
                    weitergeleitet
                  </li>
                  <li>
                    <strong>Datenschutzerklärung:</strong>
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                      >https://policies.google.com/privacy</a
                    >
                  </li>
                  <li>
                    <strong>API Terms of Service:</strong>
                    <a
                      href="https://ai.google.dev/gemini-api/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                      >https://ai.google.dev/gemini-api/terms</a
                    >
                  </li>
                </ul>
              </div>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                4.3 Supabase (Backend, Authentifizierung &amp; Rate-Limiting)
              </h3>
              <p>
                Die App nutzt Supabase für serverseitige Edge Functions (OAuth 2.0 Token-Austausch und
                KI-Anfragen), zur Verwaltung täglicher KI-Nutzungskontingente sowie zur kurzzeitigen
                Wiederherstellung laufender KI-Anfragen nach Verbindungsabbruch oder Bildschirmsperre.
              </p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Anbieter:</strong> Supabase, Inc., 970 Toa Payoh North #07-04, Singapore
                  318992
                </li>
                <li>
                  <strong>Datenstandort:</strong> EU (Frankfurt am Main, Deutschland –
                  <code>eu-central-1</code>)
                </li>
                <li>
                  <strong>Zweck:</strong> Sicherer OAuth-Token-Austausch, Schutz der
                  KI-Systemanweisungen/API-Schlüssel, Ausfallsicherheit bei KI-Anfragen und Schutz vor
                  Missbrauch durch tägliche Anfrage-Limits
                </li>
                <li>
                  <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)
                  und Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an IT-Sicherheit,
                  Ausfallsicherheit und Kostenkontrolle)
                </li>
                <li>
                  <strong>Gespeicherte Daten:</strong> Pseudonyme Google-Subjekt-ID
                  (<code>sub</code>), Tagesdatum (UTC) und Anzahl der täglichen KI-Anfragen in der
                  Tabelle <code>ai_daily_usage</code>, kurzfristige Recovery-Antworten
                  (<code>response_payload</code>, 30 Minuten gültig) in <code>ai_request_results</code>,
                  Abonnement-/Einladungsstatus (<code>user_subscriptions</code>,
                  <code>invite_grants</code>), ein serverseitig gepfefferter pseudonymer
                  <code>HMAC-SHA256</code>-Subjekt-Digest zum Missbrauchsschutz des Starter-Kontingents
                  (<code>free_allowance_usage</code>, Rechtsgrundlage Art. 6 Abs. 1 lit. f und Art.
                  17 Abs. 3 lit. e DSGVO) sowie pro Monat aggregierte KI-Token-Statistiken
                  (<code>ai_monthly_token_usage</code>). Im Falle einer vorübergehenden
                  Nicht-Erreichbarkeit von Stripe bei Kontolöschung wird kurzfristig ausschließlich
                  die nicht-personenbezogene Abonnement-ID (ohne <code>user_id</code> oder E-Mail)
                  in <code>pending_subscription_cancellations</code> zur automatischen Nachholung der
                  Kündigung vorgemerkt.
                </li>
                <li>
                  <strong>Datenschutzerklärung:</strong>
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >https://supabase.com/privacy</a
                  >
                </li>
              </ul>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                4.4 Stripe / Link (Zahlungsabwicklung &amp; Merchant of Record)
              </h3>
              <p>
                Für das kostenpflichtige Abonnement <strong>GainzAI Pro</strong> (7,99 € / Monat
                inkl. MwSt.) nutzt die App <strong>Stripe Managed Payments / Link</strong> als
                Merchant of Record.
              </p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Anbieter:</strong> Stripe Payments Europe, Limited (1 Grand Canal Street
                  Lower, Grand Canal Dock, Dublin, D02 H210, Irland) bzw. Stripe, Inc. (USA)
                </li>
                <li>
                  <strong>Zweck:</strong> Hosted Checkout, Zahlungsabwicklung, Umsatzsteuer-Berechnung,
                  Rechnungen/Belege (Ausweis als <code>LINK.COM*</code>), Kulanz-/Mahnwesen sowie
                  Self-Service-Kündigung im Kundenportal
                </li>
                <li>
                  <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)
                </li>
                <li>
                  <strong>Übermittelte Daten:</strong> Pseudonyme Konto-Referenz
                  (<code>client_reference_id</code> / <code>user_id</code>-Metadatum zur eindeutigen
                  Zuordnung) sowie von Ihnen direkt bei Stripe / Link eingegebene Zahlungs-,
                  Adress- und Rechnungsdaten
                </li>
                <li>
                  <strong>Datenschutzerklärung:</strong>
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >https://stripe.com/privacy</a
                  >
                </li>
              </ul>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                4.5 Cloudflare Pages (Hosting &amp; CDN)
              </h3>
              <p>Diese Web-Anwendung wird über Cloudflare Pages bereitgestellt.</p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Anbieter:</strong> Cloudflare, Inc., 101 Townsend St, San Francisco, CA
                  94107, USA
                </li>
                <li>
                  <strong>Zweck:</strong> Auslieferung der Web-Anwendung (CDN), DDoS-Schutz und
                  Sicherstellung der technischen Verfügbarkeit (Schriftarten werden lokal mit der App
                  ausgeliefert; es erfolgt kein Abruf externer Google Fonts)
                </li>
                <li>
                  <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
                  Interesse an sicherer und performanter Bereitstellung)
                </li>
                <li>
                  <strong>Verarbeitete Daten:</strong> Technische Zugriffsdaten in Edge-Logs (z. B.
                  IP-Adresse, Zeitpunkt des Abrufs, angeforderte URL, User-Agent)
                </li>
                <li>
                  <strong>Datenschutzerklärung:</strong>
                  <a
                    href="https://www.cloudflare.com/privacypolicy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >https://www.cloudflare.com/privacypolicy/</a
                  >
                </li>
              </ul>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">4.6 Übermittlung in Drittländer</h3>
              <p>
                <strong>USA &amp; Singapur / Drittländer:</strong> Die Datenübermittlung an
                Dienstleister mit Sitz oder Muttergesellschaft in den USA bzw. in Singapur (Google LLC
                [USA], Stripe, Inc. / Stripe Payments Europe [USA/IE], Cloudflare, Inc. [USA],
                Functional Software, Inc. / Sentry [USA], Supabase, Inc. [Singapur, mit
                EU-Datenbankhosting in Frankfurt am Main]) erfolgt auf Grundlage der
                Standardvertragsklauseln der EU-Kommission (SCCs) sowie, soweit für US-Anbieter
                zutreffend, des EU-U.S. Data Privacy Frameworks.
              </p>
              <p>
                <strong>Risiken:</strong> Die Übermittlung von Daten in Drittländer außerhalb der EU
                bzw. des EWR kann mit Risiken verbunden sein, da dortige Behörden unter bestimmten
                gesetzlichen Umständen Zugriff auf Daten verlangen könnten.
              </p>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">5. Speicherdauer</h2>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">5.1 Lokale Daten</h3>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Benutzerprofil, Auszeiten &amp; Trainingspläne:</strong> Bis zur Löschung
                  durch Sie (z. B. durch Löschen der Browser-/App-Daten)
                </li>
                <li><strong>Trainingsprotokolle:</strong> Bis zur Löschung durch Sie</li>
                <li><strong>Access &amp; Refresh Tokens:</strong> Bis zum Ablauf oder zur Abmeldung</li>
                <li>
                  <strong>Einwilligungsstatus:</strong> Bis zum Widerruf der Einwilligung oder zur
                  Löschung der App-Daten
                </li>
                <li><strong>KI-Unterhaltungen:</strong> Automatische Löschung nach 28 Tagen</li>
              </ul>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">5.2 Google Drive Daten</h3>
              <p>
                Ihre in Google Drive gespeicherten Daten unterliegen Ihrer Kontrolle. Sie können diese
                jederzeit selbst löschen.
              </p>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">5.3 Sentry</h3>
              <p>
                Fehlerdaten werden für 90 Tage in Sentry gespeichert und anschließend automatisch
                gelöscht.
              </p>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                5.4 Bei Google Generative AI, Supabase &amp; Stripe / Link
              </h3>
              <p>
                Google verarbeitet übermittelte Daten gemäß den Generative AI API Terms of Service.
                In unserem Supabase-Backend sind pseudonyme Tageszähler (<code>ai_daily_usage</code>)
                auf <strong>30 Tage</strong> und Recovery-Zwischenspeicher (<code>ai_request_results</code>)
                auf <strong>30 Minuten</strong> begrenzt. Abonnement- und Tester-Einträge
                (<code>user_subscriptions</code>, <code>invite_grants</code>) bleiben für die Dauer
                des Zugangs bzw. Ihres Kontos gespeichert und werden bei Kontolöschung sofort
                gelöscht; ein bei temporärem Stripe-Ausfall angelegter, nicht-personenbezogener
                Kündigungs-Vormerk-Eintrag (<code>pending_subscription_cancellations</code>) wird
                entfernt, sobald die Kündigung bei Stripe bestätigt wurde. Der serverseitig
                gepfefferte <code>HMAC-SHA256</code>-Digest zum Schutz vor mehrfacher
                Inanspruchnahme des kostenfreien Starter-Kontingents (<code>free_allowance_usage</code>)
                unterliegt gemäß Art. 5 Abs. 1 lit. e, Art. 6 Abs. 1 lit. f und Art. 17 Abs. 3
                lit. e DSGVO einer maximalen Inaktivitäts-Speicherdauer von
                <strong>24 Monaten</strong> und wird danach automatisch bereinigt. Monatliche
                Kostenstatistiken (<code>ai_monthly_token_usage</code>) werden bei Kontolöschung je
                Monat mit einer nicht verknüpfbaren Zufalls-UUID (<code>deleted:&lt;uuid&gt;</code>)
                irreversibel anonymisiert. Bei <strong>Stripe / Link</strong> (Merchant of Record)
                unterliegen Rechnungs-, Steuer- und Transaktionsbelege den gesetzlichen
                handels- und steuerrechtlichen Aufbewahrungspflichten (insbesondere 6 bis 10 Jahre
                nach HGB/AO), die von einer Kontolöschung in der App unberührt bleiben.
              </p>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">6. Ihre Rechte</h2>
            <p>Sie haben folgende Rechte gemäß DSGVO:</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground">6.1 Auskunftsrecht (Art. 15 DSGVO)</h3>
                <p>
                  Sie haben das Recht, Auskunft über Ihre von uns verarbeiteten personenbezogenen
                  Daten zu verlangen.
                </p>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground">6.2 Berichtigungsrecht (Art. 16 DSGVO)</h3>
                <p>
                  Sie haben das Recht, die Berichtigung unrichtiger oder die Vervollständigung Ihrer
                  gespeicherten Daten zu verlangen.
                </p>
              </div>
            </div>

            <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
              <h3 class="font-medium text-foreground">6.3 Löschungsrecht (Art. 17 DSGVO)</h3>
              <p>
                Sie haben das Recht auf Löschung Ihrer personenbezogenen Daten („Recht auf
                Vergessenwerden“).
              </p>
              <p class="text-sm font-medium">So löschen Sie Ihre Daten:</p>
              <ul class="list-disc pl-5 space-y-1 text-sm">
                <li>
                  <strong>Direkt in der App („Konto &amp; Daten löschen“):</strong> Kündigt ein
                  aktives Stripe-Abonnement (sofern Stripe vorübergehend nicht erreichbar ist, über
                  einen nicht-personenbezogenen Vormerk-Eintrag), löscht sofort Ihre
                  Supabase-Serverdaten (<code>user_subscriptions</code>, <code>invite_grants</code>,
                  <code>ai_daily_usage</code>, <code>ai_request_results</code>), anonymisiert
                  monatliche Token-Kostenzeilen irreversibel je Monat per Zufalls-UUID
                  (<code>deleted:&lt;uuid&gt;</code>), widerruft den Google-OAuth-Zugriff und
                  entfernt alle lokalen App-Daten inkl. Billing-Cache. Der pseudonyme
                  <code>HMAC-SHA256</code>-Starter-Digest bleibt ausschließlich zweckgebunden zum
                  Missbrauchsschutz (Art. 6 Abs. 1 lit. f, Art. 17 Abs. 3 lit. e DSGVO) für maximal
                  24 Monate Inaktivität (Art. 5 Abs. 1 lit. e DSGVO) gespeichert.
                </li>
                <li>
                  <strong>Lokale Daten:</strong> Löschen Sie zusätzlich bei Bedarf Browser-Cache
                  und App-Daten auf dem Gerät
                </li>
                <li>
                  <strong>Google Drive Daten:</strong> Verbleiben unter Ihrer Kontrolle und können
                  jederzeit direkt im Löschdialog oder in Google Drive gelöscht werden
                </li>
                <li>
                  <strong>Sentry:</strong> Fehlerdaten werden automatisch nach 90 Tagen gelöscht
                </li>
                <li>
                  <strong>Supabase:</strong> Recovery-Cache verfällt nach 30 Minuten, Tageszähler
                  nach 30 Tagen; Abo- und Einladungsdaten (<code>user_subscriptions</code>,
                  <code>invite_grants</code>) werden über „Konto &amp; Daten löschen“ sofort
                  entfernt, Monatskosten je Monat per <code>deleted:&lt;uuid&gt;</code>
                  anonymisiert, eventuelle Kündigungs-Vormerkungen
                  (<code>pending_subscription_cancellations</code>) nach Stripe-Vollzug gelöscht
                  und der pseudonyme <code>HMAC-SHA256</code>-Starter-Digest nach spätestens 24
                  Monaten Inaktivität bereinigt
                </li>
                <li>
                  <strong>Stripe / Link:</strong> Aktive Abonnements werden bei Kontolöschung
                  sofort gekündigt; gesetzlich vorgeschriebene Abrechnungs- und Steuerbelege
                  (z. B. 6–10 Jahre nach HGB/AO) verbleiben gemäß gesetzlicher Pflicht bei Stripe
                </li>
                <li>
                  <strong>Google Generative AI:</strong> Kontaktieren Sie Google gemäß deren
                  Datenschutzrichtlinien
                </li>
              </ul>
              <UiButton
                v-if="authStore.isLoggedIn"
                variant="destructive"
                size="sm"
                class="w-full"
                @click="isDeleteDialogOpen = true"
              >
                {{ t("account.deleteButton") }}
              </UiButton>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground text-sm">
                  6.4 Einschränkung der Verarbeitung (Art. 18 DSGVO)
                </h3>
                <p class="text-sm">
                  Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer personenbezogenen
                  Daten zu verlangen.
                </p>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground text-sm">
                  6.5 Datenübertragbarkeit (Art. 20 DSGVO)
                </h3>
                <p class="text-sm">
                  Sie haben das Recht, die Sie betreffenden personenbezogenen Daten in einem
                  strukturierten, gängigen Format zu erhalten (z. B. direkt über Ihre Google-Tabelle).
                </p>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground text-sm">
                  6.6 Widerspruchsrecht (Art. 21 DSGVO)
                </h3>
                <p class="text-sm">
                  Sie haben das Recht, jederzeit gegen die Verarbeitung Widerspruch einzulegen.
                </p>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                <h3 class="font-medium text-foreground text-sm">
                  6.7 Widerruf der Einwilligung (Art. 7 Abs. 3 DSGVO)
                </h3>
                <p class="text-sm">
                  Sie können Ihre erteilte Einwilligung jederzeit mit Wirkung für die Zukunft
                  widerrufen. Zudem können Sie den Google-Zugriff jederzeit in Ihrem
                  <a
                    href="https://myaccount.google.com/permissions"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >Google-Konto</a
                  >
                  entfernen.
                </p>
                <p v-if="formattedConsentDate" class="text-xs text-muted-foreground">
                  {{ t("legal.consent.acceptedAt", { date: formattedConsentDate }) }}
                </p>
                <UiButton
                  v-if="canWithdrawConsent"
                  variant="destructive"
                  size="sm"
                  class="w-full"
                  @click="handleWithdrawConsent"
                >
                  {{ t("legal.consent.withdrawButton") }}
                </UiButton>
              </div>
            </div>

            <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-1">
              <h3 class="font-medium text-foreground">6.8 Beschwerderecht (Art. 77 DSGVO)</h3>
              <p class="text-sm">
                Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
                Zuständige Aufsichtsbehörde am Sitz des Verantwortlichen ist das
                <strong>Bayerische Landesamt für Datenschutzaufsicht (BayLDA)</strong>, Promenade 18,
                91522 Ansbach, Deutschland (<a
                  href="https://www.lda.bayern.de"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary hover:underline"
                  >https://www.lda.bayern.de</a
                >).
              </p>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">7. Datensicherheit</h2>
            <p>Wir setzen technische und organisatorische Maßnahmen ein, um Ihre Daten zu schützen:</p>
            <ul class="list-disc pl-5 space-y-1">
              <li>
                <strong>Verschlüsselung:</strong> HTTPS-Verbindungen für alle Datenübertragungen
              </li>
              <li>
                <strong>OAuth 2.0:</strong> Sichere Authentifizierung ohne Speicherung Ihres
                Google-Passworts
              </li>
              <li>
                <strong>Lokale Speicherung:</strong> Daten werden primär lokal auf Ihrem Gerät
                gespeichert
              </li>
              <li>
                <strong>Minimale Server-Speicherung:</strong> Ihre Trainingsprotokolle und
                Profildaten verbleiben ausschließlich lokal und in Ihrem eigenen Google Drive; auf
                dem Supabase-EU-Backend werden nur pseudonyme Tageszähler (30 Tage),
                Recovery-Zwischenspeicher (30 Minuten), Abo-/Tester-Berechtigungen
                (<code>user_subscriptions</code>, <code>invite_grants</code>), monatliche
                Token-Kostenstatistiken (bei Kontolöschung je Monat per Zufalls-UUID anonymisiert)
                sowie der zweckgebundene <code>HMAC-SHA256</code>-Starter-Digest (max. 24 Monate
                Inaktivität) gespeichert
              </li>
              <li>
                <strong>Access &amp; Refresh Token Management:</strong> Kurze Gültigkeitsdauer der
                Access Tokens mit sicherem OAuth 2.0 Authorization Code Flow
              </li>
            </ul>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">
              8. Cookies und ähnliche Technologien
            </h2>
            <p>
              Die App verwendet keine Tracking- oder Werbe-Cookies. Sie nutzt den lokalen
              Browser-/WebView-Speicher (<code>localStorage</code>) für Profildaten,
              Trainings-Caches, Auszeiten, KI-Unterhaltungen, Einwilligungsstatus und Einstellungen
              sowie in nativen iOS-/Android-Apps zusätzlich den
              <strong>app-isolierten Gerätespeicher</strong> (<code>Capacitor Preferences</code>:
              UserDefaults unter iOS bzw. SharedPreferences unter Android) für OAuth-Tokens.
            </p>
            <p>
              <strong>Service Worker / PWA:</strong> Die App kann als PWA installiert werden und
              nutzt Service Worker für Offline-Funktionalität.
            </p>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">9. Minderjährige</h2>
            <p>
              Die App richtet sich an Personen ab 16 Jahren. Personen unter 16 Jahren dürfen die App
              nur mit Zustimmung eines Erziehungsberechtigten nutzen.
            </p>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">
              10. Änderungen der Datenschutzerklärung
            </h2>
            <p>
              Wir behalten uns vor, diese Datenschutzerklärung anzupassen. Die aktuelle Fassung ist
              stets in der App verfügbar. Bei wesentlichen Änderungen holen wir vor der weiteren
              Nutzung eine erneute Einwilligung ein.
            </p>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">11. Kontakt</h2>
            <div class="bg-white/5 rounded-xl p-4 font-mono text-sm border border-white/5">
              E-Mail: app.gainz.ai@gmail.com<br />
              Postanschrift:<br />
              Sabahattin Giritli<br />
              Am Kesselhaus 28<br />
              80999 München<br />
              Deutschland
            </div>
          </section>
        </template>

        <template v-else>
          <section class="space-y-4">
            <h2 class="text-2xl font-bold text-foreground">Privacy Policy</h2>
            <p class="text-sm italic">Last Updated: November 27, 2026</p>
            <p>
              This Privacy Policy applies to the Gainz AI app (hereinafter "App" or "Application") and
              explains what personal and optional health-related data we collect, how we process it,
              and what rights you have.
            </p>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">1. Controller</h2>
            <div class="bg-white/5 rounded-xl p-4 font-mono text-sm border border-white/5">
              Sabahattin Giritli<br />
              Am Kesselhaus 28<br />
              80999 Munich<br />
              Germany<br />
              Email: app.gainz.ai@gmail.com
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">2. Data Collection</h2>

            <div class="space-y-4">
              <h3 class="text-lg font-medium text-foreground">2.1 Data You Provide Directly</h3>
              <p>
                When using the app, the following data is stored locally on your device and, where
                applicable, in your own Google Drive spreadsheet:
              </p>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground">User Profile</h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li><strong>Age</strong> (age)</li>
                  <li><strong>Height in cm</strong> (heightCm)</li>
                  <li><strong>Weight in kg</strong> (weightKg)</li>
                  <li>
                    <strong>Fitness goals</strong> (fitnessGoal): e.g. build muscle, lose fat, improve
                    endurance
                  </li>
                  <li>
                    <strong>Fitness level</strong> (fitnessLevel): beginner, intermediate, advanced
                  </li>
                  <li><strong>Workout days per week</strong> (workoutDaysPerWeek)</li>
                  <li><strong>Workout duration in minutes</strong> (workoutDurationMinutes)</li>
                  <li><strong>Workout location</strong> (workoutLocation): gym, home, both</li>
                  <li>
                    <strong>Available equipment</strong> (equipmentAccess): e.g. dumbbells, pull-up
                    bar, etc.
                  </li>
                  <li>
                    <strong>Additional notes</strong> (freeUserInput): extra details you provide
                    voluntarily (such as injuries, focus areas, or limitations)
                  </li>
                </ul>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground">Training Log (Exercise Logs)</h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li><strong>Exercise name</strong> (exerciseName)</li>
                  <li><strong>Date and time</strong> of the exercise (loggedAt)</li>
                  <li>
                    <strong>Sets, reps, weight, distance, duration, RPE</strong> and other
                    training-related metrics
                  </li>
                  <li><strong>Unique ID</strong> to identify each entry</li>
                </ul>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground">Rest &amp; Recovery Events</h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Event type &amp; date range</strong> (<code>events</code>): Rest Day,
                    Sickness, Injury, Fasting, or custom entries with associated dates (stored
                    strictly locally on your device; transmitted to Google Generative AI when
                    requesting coaching, not saved in Google Drive)
                  </li>
                </ul>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground">
                  AI Chat &amp; Derived Training Analytics
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Chat inputs &amp; history</strong> (<code>question</code>,
                    <code>previousMessages</code>): questions you ask the AI coach and recent chat
                    context
                  </li>
                  <li>
                    <strong>Training analytics &amp; plans</strong> (<code>insights</code>,
                    <code>trainingSummaries</code>, <code>activePlan</code>): calculated workload
                    metrics (ACWR, e1RM, volume landmarks, fatigue/deload state), monthly summaries,
                    and your active training plan
                  </li>
                </ul>
              </div>

              <div class="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm space-y-1">
                <p class="font-semibold text-foreground">
                  Notice on Health Data (Art. 9(1) GDPR):
                </p>
                <p>
                  If you record <strong>Sickness</strong> or <strong>Injury</strong> events under Rest
                  &amp; Recovery or enter injury/health information in free-text fields
                  (<code>freeUserInput</code>, Coach chat), those entries may constitute special
                  categories of personal data (health data). Providing such details is completely
                  voluntary and is processed strictly based on your explicit consent.
                </p>
              </div>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                2.2 Automatically Stored Local Data
              </h3>
              <h4 class="font-medium text-foreground">Local and Device-Specific Storage</h4>
              <p>
                The app stores data locally in your browser/WebView storage
                (<code>localStorage</code>) and, for authentication tokens in native apps, in
                app-isolated native device storage (<code>Capacitor Preferences</code> on
                iOS/Android):
              </p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Browser/WebView <code>localStorage</code>:</strong> User profile data,
                  training log cache, exercise muscle classifications, training plans, rest &amp;
                  recovery events, setup status, language preference (<code>gainz-locale</code>),
                  consent record with timestamp and version (<code>gainz-legal-consent</code>),
                  local billing entitlement cache (<code>billing:entitlement-v1</code>), and AI
                  conversations (retained for 28 days)
                </li>
                <li>
                  <strong>Session state (<code>sessionStorage</code>):</strong> Short-lived
                  pending invite code and checkout return markers
                </li>
                <li>
                  <strong>OAuth tokens:</strong> Google OAuth access token, refresh token, ID token,
                  and expiration timestamp (stored via <code>Capacitor Preferences</code> on
                  iOS/Android, and in <code>localStorage</code> on web)
                </li>
              </ul>
            </div>

            <div class="space-y-2 border-l-2 border-primary/50 pl-4 py-2 bg-primary/5 rounded-r-xl">
              <h3 class="text-lg font-medium text-foreground">
                2.3 Storage &amp; Backend Processing
              </h3>
              <p>
                <strong>Important:</strong> Your training logs and user profile are not permanently
                stored on the provider's servers. Instead, they remain:
              </p>
              <ul class="list-disc pl-5 space-y-1 font-medium">
                <li>locally on your device (<code>localStorage</code> or Capacitor Preferences)</li>
                <li>in your own Google Drive spreadsheet (Google Sheets)</li>
              </ul>
              <p class="text-sm mt-2">
                For OAuth token exchange, forwarding AI requests to Google Generative AI, managing
                subscription and tester entitlements (<code>user_subscriptions</code>,
                <code>invite_grants</code>), maintaining the pseudonymous starter-budget anti-abuse
                digest (<code>HMAC-SHA256</code> with a 24-month inactivity TTL), monthly
                aggregated AI token cost statistics, enforcing daily usage limits, and short-lived
                recovery after screen lock or connection drops (up to 30-minute temporary response
                cache), the app uses a backend powered by <strong>Supabase</strong> (hosting
                region EU Central / Frankfurt am Main, Germany).
              </p>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">
              3. Purpose &amp; Legal Basis of Processing
            </h2>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">3.1 Providing App Functionality</h3>
              <p>
                <strong>Purpose:</strong> Managing your fitness profile, tracking training sessions,
                creating personalized training plans, and computing load analytics.
              </p>
              <p>
                <strong>Legal basis:</strong> Art. 6(1)(b) GDPR (performance of a contract / Terms of
                Use), Art. 6(1)(a) GDPR (consent), and Art. 9(2)(a) GDPR (explicit consent for
                voluntary health or injury details).
              </p>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                3.2 AI-Powered Training Recommendations
              </h3>
              <p>
                <strong>Purpose:</strong> Providing personalized training recommendations, workout
                plans, and exercise classifications powered by Google Generative AI.
              </p>
              <p>
                <strong>Legal basis:</strong> Art. 6(1)(a) GDPR (consent) and Art. 9(2)(a) GDPR
                (explicit consent for voluntary sickness, injury, or limitation details).
              </p>
              <p>
                <strong>Data transfer:</strong> Your profile data, training logs, monthly summaries,
                workload/fatigue insights, recovery/health events, active training plan, and chat
                history are transmitted via our Supabase backend to Google Generative AI (Google LLC,
                USA) to generate AI-based coaching recommendations.
              </p>
              <p class="text-sm text-muted-foreground">
                No automated decision-making producing legal or similarly significant effects within
                the meaning of Art. 22 GDPR takes place.
              </p>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                3.3 Google Drive Integration &amp; Scopes
              </h3>
              <p>
                <strong>Purpose:</strong> Storing and syncing your training data in your own Google
                Drive spreadsheet.
              </p>
              <p><strong>Legal basis:</strong> Art. 6(1)(a) GDPR (consent).</p>
              <p class="font-medium">Required permissions (OAuth Scopes):</p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <code>https://www.googleapis.com/auth/drive.file</code>: Create and edit only files
                  created by Gainz AI or explicitly opened by you with the app (no full access to your
                  Google Drive or other files).
                </li>
                <li>
                  <code>openid</code>: Secure authentication and cryptographic verification of your
                  Google account for server-side rate limiting.
                </li>
              </ul>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">4. Third-Party Data Transfers</h2>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">4.1 Sentry (Error Monitoring)</h3>
              <p>The app uses Sentry for technical error monitoring and stability improvements.</p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Provider:</strong> Functional Software, Inc., 45 Fremont Street, 8th Floor,
                  San Francisco, CA 94105, USA
                </li>
                <li><strong>Purpose:</strong> Detecting and resolving technical errors</li>
                <li>
                  <strong>Legal basis:</strong> Art. 6(1)(f) GDPR (legitimate interest in error
                  analysis and app stability)
                </li>
                <li>
                  <strong>Data region:</strong> EU (Germany – <code>ingest.de.sentry.io</code>)
                </li>
                <li>
                  <strong>Data transmitted:</strong> Error messages, stack traces, browser/device info
                  (User Agent), scrubbed HTTP request URLs, console logs, referrer URL
                </li>
                <li>
                  <strong>Data minimization &amp; scrubbing:</strong> Default PII collection is
                  disabled (<code>sendDefaultPii</code> off); user objects, cookies, email addresses,
                  OAuth tokens/query secrets, and AI advice payloads are stripped client-side, and IP
                  address storage is disabled at project level
                </li>
                <li>
                  <strong>Privacy Policy:</strong>
                  <a
                    href="https://sentry.io/privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >https://sentry.io/privacy/</a
                  >
                </li>
              </ul>
            </div>

            <div class="space-y-4">
              <h3 class="text-lg font-medium text-foreground">4.2 Google LLC (Alphabet Inc.)</h3>
              <p>The app uses the following Google services:</p>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground underline decoration-primary/30">
                  Google OAuth 2.0 / Google Sign-In
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Purpose:</strong> Authentication and authorization for Google Drive access
                    and rate limiting
                  </li>
                  <li>
                    <strong>Data transmitted:</strong> OAuth codes, access/refresh/ID tokens, granted
                    scopes
                  </li>
                  <li>
                    <strong>Privacy Policy:</strong>
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                      >https://policies.google.com/privacy</a
                    >
                  </li>
                </ul>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground underline decoration-primary/30">
                  Google Drive / Google Sheets
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li><strong>Purpose:</strong> Storing your training data</li>
                  <li>
                    <strong>Data transmitted:</strong> Your profile, training logs, body metrics,
                    monthly training summaries, and deload state
                  </li>
                  <li><strong>Storage location:</strong> Your own Google Drive spreadsheet</li>
                  <li>
                    <strong>Control:</strong> You retain full control over this data in your Google
                    Drive
                  </li>
                </ul>
                <div class="mt-3 p-3 bg-white/5 rounded-xl border border-white/5 text-xs space-y-1">
                  <p class="font-semibold text-foreground">Google API Limited Use Disclosure:</p>
                  <p>
                    Gainz AI's use and transfer to any other app of information received from Google
                    APIs will adhere to the
                    <a
                      href="https://developers.google.com/terms/api-services-user-data-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                      >Google API Services User Data Policy</a
                    >, including the Limited Use requirements.
                  </p>
                </div>
              </div>

              <div class="space-y-2">
                <h4 class="font-medium text-foreground underline decoration-primary/30">
                  Google Generative AI (Gemini API)
                </h4>
                <ul class="list-disc pl-5 space-y-1">
                  <li>
                    <strong>Purpose:</strong> AI-powered training recommendations, workout planning,
                    and exercise classification
                  </li>
                  <li>
                    <strong>Data transmitted:</strong> Your user profile (incl. voluntary free-text
                    notes), training logs, monthly summaries, workload/fatigue insights (ACWR, e1RM,
                    deload), rest &amp; recovery/health events (rest, sickness, injury, fasting),
                    active training plan, chat questions/history, language/locale setting, and current
                    date
                  </li>
                  <li>
                    <strong>Transfer path:</strong> Requests are forwarded to the Gemini API through
                    our Supabase backend (Edge Functions) using the provider's central API key
                  </li>
                  <li>
                    <strong>Privacy Policy:</strong>
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                      >https://policies.google.com/privacy</a
                    >
                  </li>
                  <li>
                    <strong>API Terms of Service:</strong>
                    <a
                      href="https://ai.google.dev/gemini-api/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                      >https://ai.google.dev/gemini-api/terms</a
                    >
                  </li>
                </ul>
              </div>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                4.3 Supabase (Backend, Authentication &amp; Rate Limiting)
              </h3>
              <p>
                The app uses Supabase for server-side Edge Functions (OAuth 2.0 token exchange and AI
                requests), managing daily AI usage quotas, and short-lived recovery of in-flight AI
                requests after screen lock or network drops.
              </p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Provider:</strong> Supabase, Inc., 970 Toa Payoh North #07-04, Singapore
                  318992
                </li>
                <li>
                  <strong>Data region:</strong> EU (Frankfurt am Main, Germany –
                  <code>eu-central-1</code>)
                </li>
                <li>
                  <strong>Purpose:</strong> Secure OAuth token exchange, protecting AI system
                  instructions/API keys, request resilience, and abuse prevention via daily request
                  limits
                </li>
                <li>
                  <strong>Legal basis:</strong> Art. 6(1)(b) GDPR (contract performance) and Art.
                  6(1)(f) GDPR (legitimate interest in IT security, reliability, and cost control)
                </li>
                <li>
                  <strong>Stored data:</strong> Pseudonymous Google subject ID (<code>sub</code>),
                  UTC calendar day and daily AI request count in <code>ai_daily_usage</code>, a
                  30-minute AI response recovery cache in <code>ai_request_results</code>,
                  subscription/invite status (<code>user_subscriptions</code>,
                  <code>invite_grants</code>), a server-peppered pseudonymous
                  <code>HMAC-SHA256</code> subject digest to prevent repeated free starter-budget
                  redemption (<code>free_allowance_usage</code>, legal basis Art. 6(1)(f) and Art.
                  17(3)(e) GDPR), and monthly aggregated AI token statistics
                  (<code>ai_monthly_token_usage</code>). If Stripe is temporarily unreachable during
                  account deletion, only the non-personal subscription ID (zero <code>user_id</code>
                  or email) is temporarily recorded in <code>pending_subscription_cancellations</code>
                  for automatic self-healing cancellation.
                </li>
                <li>
                  <strong>Privacy Policy:</strong>
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >https://supabase.com/privacy</a
                  >
                </li>
              </ul>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                4.4 Stripe / Link (Payments &amp; Merchant of Record)
              </h3>
              <p>
                For the paid <strong>GainzAI Pro</strong> subscription (€7.99 / month incl. VAT),
                the app uses <strong>Stripe Managed Payments / Link</strong> acting as Merchant of
                Record.
              </p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Provider:</strong> Stripe Payments Europe, Limited (1 Grand Canal Street
                  Lower, Grand Canal Dock, Dublin, D02 H210, Ireland) and Stripe, Inc. (USA)
                </li>
                <li>
                  <strong>Purpose:</strong> Hosted Checkout, payment processing, VAT/GST remittance,
                  receipts/invoices (appearing as <code>LINK.COM*</code>), dunning retries, and
                  self-service cancellation via Customer Portal
                </li>
                <li>
                  <strong>Legal basis:</strong> Art. 6(1)(b) GDPR (performance of contract)
                </li>
                <li>
                  <strong>Data transmitted:</strong> Pseudonymous account identifier
                  (<code>client_reference_id</code> / <code>user_id</code> metadata for reliable
                  entitlement binding) plus payment and billing details you enter directly with
                  Stripe / Link
                </li>
                <li>
                  <strong>Privacy Policy:</strong>
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >https://stripe.com/privacy</a
                  >
                </li>
              </ul>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                4.5 Cloudflare Pages (Hosting &amp; CDN)
              </h3>
              <p>This web application is delivered via Cloudflare Pages.</p>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>Provider:</strong> Cloudflare, Inc., 101 Townsend St, San Francisco, CA
                  94107, USA
                </li>
                <li>
                  <strong>Purpose:</strong> Delivering the web app (CDN), DDoS protection, and
                  ensuring technical availability (fonts are bundled locally with the app; no external
                  Google Fonts requests are made)
                </li>
                <li>
                  <strong>Legal basis:</strong> Art. 6(1)(f) GDPR (legitimate interest in secure,
                  reliable delivery)
                </li>
                <li>
                  <strong>Processed data:</strong> Technical access logs at the edge (e.g., IP
                  address, timestamp, requested URL, User-Agent)
                </li>
                <li>
                  <strong>Privacy Policy:</strong>
                  <a
                    href="https://www.cloudflare.com/privacypolicy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >https://www.cloudflare.com/privacypolicy/</a
                  >
                </li>
              </ul>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">4.6 International Data Transfers</h3>
              <p>
                <strong>USA &amp; Singapore / Third countries:</strong> Data transfers involving
                service providers established or parent-held in the USA or Singapore (Google LLC
                [USA], Stripe, Inc. / Stripe Payments Europe [USA/IE], Cloudflare, Inc. [USA],
                Functional Software, Inc. / Sentry [USA], Supabase, Inc. [Singapore, with EU database
                hosting in Frankfurt am Main]) rely on the European Commission's Standard Contractual
                Clauses (SCCs) and, where applicable for US providers, the EU-U.S. Data Privacy
                Framework.
              </p>
              <p>
                <strong>Risks:</strong> Transferring data to countries outside the EU/EEA carries
                potential risks, as local authorities may compel access to data under applicable
                statutory frameworks.
              </p>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">5. Retention Period</h2>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">5.1 Local Data</h3>
              <ul class="list-disc pl-5 space-y-1">
                <li>
                  <strong>User profile, recovery events &amp; training plans:</strong> Until deleted by
                  you (e.g. clearing browser/app storage)
                </li>
                <li><strong>Training logs:</strong> Until deleted by you</li>
                <li><strong>Access &amp; refresh tokens:</strong> Until expiration or sign out</li>
                <li>
                  <strong>Consent record:</strong> Until consent is withdrawn or app storage is
                  cleared
                </li>
                <li><strong>AI conversations:</strong> Automatically deleted after 28 days</li>
              </ul>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">5.2 Google Drive Data</h3>
              <p>
                Data stored in your Google Drive remains under your full control and can be deleted by
                you at any time.
              </p>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">5.3 Sentry</h3>
              <p>
                Error records are retained in Sentry for 90 days and then automatically deleted.
              </p>
            </div>

            <div class="space-y-2">
              <h3 class="text-lg font-medium text-foreground">
                5.4 Google Generative AI, Supabase &amp; Stripe / Link
              </h3>
              <p>
                Google processes submitted data under the Generative AI API Terms of Service. In our
                Supabase backend, pseudonymous daily usage counters (<code>ai_daily_usage</code>)
                are limited to a retention window of <strong>30 days</strong>, and temporary AI
                response recovery entries (<code>ai_request_results</code>) expire after
                <strong>30 minutes</strong>. Subscription and tester records
                (<code>user_subscriptions</code>, <code>invite_grants</code>) are retained for the
                duration of active entitlement or account existence and are deleted immediately upon
                account deletion; any non-personal cancellation tombstone
                (<code>pending_subscription_cancellations</code>) created during a transient Stripe
                outage is removed once Stripe confirms cancellation. The server-peppered
                pseudonymous <code>HMAC-SHA256</code> anti-abuse starter digest
                (<code>free_allowance_usage</code>) is strictly limited under GDPR Art. 5(1)(e), Art.
                6(1)(f), and Art. 17(3)(e) to a maximum inactivity period of
                <strong>24 months</strong> before automatic cleanup. Monthly AI token cost rollups
                (<code>ai_monthly_token_usage</code>) are irreversibly anonymized per month on
                account deletion using an unlinked random UUID (<code>deleted:&lt;uuid&gt;</code>).
                At <strong>Stripe / Link</strong> (Merchant of Record), invoices, tax records, and
                transaction logs remain subject to mandatory statutory commercial and tax retention
                periods (typically 6–10 years under German HGB/AO), which are unaffected by app
                account deletion.
              </p>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">6. Your Rights</h2>
            <p>Under the GDPR, you have the following rights:</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground">6.1 Right of Access (Art. 15 GDPR)</h3>
                <p>
                  You have the right to obtain confirmation and information about your personal data
                  processed by us.
                </p>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground">
                  6.2 Right to Rectification (Art. 16 GDPR)
                </h3>
                <p>
                  You have the right to request correction of inaccurate data or completion of
                  incomplete personal data.
                </p>
              </div>
            </div>

            <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
              <h3 class="font-medium text-foreground">6.3 Right to Erasure (Art. 17 GDPR)</h3>
              <p>
                You have the right to request deletion of your personal data ("right to be forgotten").
              </p>
              <p class="text-sm font-medium">How to delete your data:</p>
              <ul class="list-disc pl-5 space-y-1 text-sm">
                <li>
                  <strong>Direct in-app (“Delete Account &amp; Data”):</strong> Immediately cancels
                  any active Stripe subscription (or records a non-personal tombstone for automatic
                  cancellation if Stripe is temporarily unreachable), deletes your Supabase server
                  data (<code>user_subscriptions</code>, <code>invite_grants</code>,
                  <code>ai_daily_usage</code>, <code>ai_request_results</code>), irreversibly
                  anonymizes monthly token cost rows per month with a random UUID
                  (<code>deleted:&lt;uuid&gt;</code>), revokes Google OAuth access, and wipes local
                  app data and billing caches. Only the pseudonymous <code>HMAC-SHA256</code>
                  starter digest is retained strictly for anti-abuse prevention (Art. 6(1)(f),
                  Art. 17(3)(e) GDPR) for up to 24 months of inactivity (Art. 5(1)(e) GDPR).
                </li>
                <li>
                  <strong>Local data:</strong> You may also clear browser cache and app data on your
                  device
                </li>
                <li>
                  <strong>Google Drive data:</strong> Remains under your control and can be trashed
                  via the deletion flow or deleted directly in Google Drive
                </li>
                <li><strong>Sentry:</strong> Error records are automatically deleted after 90 days</li>
                <li>
                  <strong>Supabase:</strong> Recovery cache expires after 30 minutes and daily usage
                  counters after 30 days; subscription and invite records
                  (<code>user_subscriptions</code>, <code>invite_grants</code>) are deleted
                  immediately via “Delete Account &amp; Data”, monthly token cost rows are
                  anonymized per month via <code>deleted:&lt;uuid&gt;</code>, cancellation
                  tombstones (<code>pending_subscription_cancellations</code>) are deleted once
                  Stripe cancellation completes, and the pseudonymous <code>HMAC-SHA256</code>
                  starter digest expires after at most 24 months of inactivity
                </li>
                <li>
                  <strong>Stripe / Link:</strong> Active subscriptions are canceled immediately on
                  account deletion; statutory invoices and tax records (e.g., 6–10 years under
                  German HGB/AO) remain retained by Stripe as required by law
                </li>
                <li>
                  <strong>Google Generative AI:</strong> Contact Google under their privacy policy
                </li>
              </ul>
              <UiButton
                v-if="authStore.isLoggedIn"
                variant="destructive"
                size="sm"
                class="w-full"
                @click="isDeleteDialogOpen = true"
              >
                {{ t("account.deleteButton") }}
              </UiButton>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground text-sm">
                  6.4 Right to Restriction (Art. 18 GDPR)
                </h3>
                <p class="text-sm">
                  You have the right to request restriction of processing of your personal data.
                </p>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground text-sm">
                  6.5 Data Portability (Art. 20 GDPR)
                </h3>
                <p class="text-sm">
                  You have the right to receive personal data concerning you in a portable format
                  (e.g., directly from your Google Spreadsheet).
                </p>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5">
                <h3 class="font-medium text-foreground text-sm">6.6 Right to Object (Art. 21 GDPR)</h3>
                <p class="text-sm">
                  You have the right to object at any time to the processing of your personal data.
                </p>
              </div>
              <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                <h3 class="font-medium text-foreground text-sm">
                  6.7 Withdrawal of Consent (Art. 7(3) GDPR)
                </h3>
                <p class="text-sm">
                  You may withdraw any previously granted consent at any time with future effect. You
                  can also revoke Google account permissions directly in your
                  <a
                    href="https://myaccount.google.com/permissions"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-primary hover:underline"
                    >Google Account</a
                  >.
                </p>
                <p v-if="formattedConsentDate" class="text-xs text-muted-foreground">
                  {{ t("legal.consent.acceptedAt", { date: formattedConsentDate }) }}
                </p>
                <UiButton
                  v-if="canWithdrawConsent"
                  variant="destructive"
                  size="sm"
                  class="w-full"
                  @click="handleWithdrawConsent"
                >
                  {{ t("legal.consent.withdrawButton") }}
                </UiButton>
              </div>
            </div>

            <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-1">
              <h3 class="font-medium text-foreground">
                6.8 Right to Lodge a Complaint (Art. 77 GDPR)
              </h3>
              <p class="text-sm">
                You have the right to lodge a complaint with a data protection supervisory authority.
                The competent supervisory authority at the controller's location is the
                <strong>Bavarian Data Protection Authority (BayLDA)</strong>, Promenade 18, 91522
                Ansbach, Germany (<a
                  href="https://www.lda.bayern.de"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-primary hover:underline"
                  >https://www.lda.bayern.de</a
                >).
              </p>
            </div>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">7. Data Security</h2>
            <p>We implement technical and organizational safeguards to protect your data:</p>
            <ul class="list-disc pl-5 space-y-1">
              <li>
                <strong>Encryption:</strong> HTTPS encryption for all network transmissions
              </li>
              <li>
                <strong>OAuth 2.0:</strong> Secure authentication without storing your Google password
              </li>
              <li>
                <strong>Local storage:</strong> Data is stored primarily locally on your device
              </li>
              <li>
                <strong>Minimal server footprint:</strong> Training logs and profile data stay local
                and in your own Google Drive; the Supabase EU backend stores only pseudonymous daily
                AI request counters (30 days), short-lived AI recovery cache (30 minutes),
                subscription/tester entitlements (<code>user_subscriptions</code>,
                <code>invite_grants</code>), monthly AI token cost rollups (anonymized per month on
                deletion with a random UUID), and the purpose-bound <code>HMAC-SHA256</code> starter
                digest (up to 24 months of inactivity)
              </li>
              <li>
                <strong>Access &amp; refresh token handling:</strong> Short-lived access tokens via
                secure OAuth 2.0 Authorization Code flow
              </li>
            </ul>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">
              8. Cookies &amp; Similar Technologies
            </h2>
            <p>
              This app does not use tracking or advertising cookies. It uses browser/WebView
              <strong><code>localStorage</code></strong> for profile data, workout caches, recovery
              events, AI conversations, consent status, and preferences, plus in native iOS/Android
              apps <strong>app-isolated native storage</strong> (<code>Capacitor Preferences</code>:
              UserDefaults on iOS / SharedPreferences on Android) for OAuth tokens.
            </p>
            <p>
              <strong>Service Worker / PWA:</strong> The app can be installed as a PWA and uses a
              Service Worker for offline support.
            </p>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">9. Minors</h2>
            <p>
              This app is intended for users aged 16 and older. Users under 16 may only use the app
              with consent from a parent or legal guardian.
            </p>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">10. Changes to This Policy</h2>
            <p>
              We reserve the right to update this Privacy Policy. The current version is always
              available within the app. For material changes, we will ask you to re-confirm your
              consent before continuing to use the app.
            </p>
          </section>

          <section class="space-y-4">
            <h2 class="text-xl font-semibold text-foreground">11. Contact</h2>
            <div class="bg-white/5 rounded-xl p-4 font-mono text-sm border border-white/5">
              Email: app.gainz.ai@gmail.com<br />
              Postal address:<br />
              Sabahattin Giritli<br />
              Am Kesselhaus 28<br />
              80999 Munich<br />
              Germany
            </div>
          </section>
        </template>
      </div>
    </main>

    <DeleteAccountSheet v-model:open="isDeleteDialogOpen" />
  </div>
</template>
