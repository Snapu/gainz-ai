<script setup lang="ts">
import { useRouter } from "vue-router";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import { t } from "@/shared/presentation/i18n";
import { useLocale } from "@/shared/presentation/i18n/useLocale";

const router = useRouter();
const { locale } = useLocale();

function handleBack(): void {
  if (router.options?.history?.state?.back) {
    router.back();
  } else {
    void router.push("/");
  }
}
</script>

<template>
  <div class="h-full bg-background flex flex-col overflow-hidden pt-safe">
    <AppHeader show-back :title="t('legal.termsTitle')" class="shrink-0" @back="handleBack" />

    <main
      class="flex-1 overflow-y-auto overscroll-y-contain px-6 pt-6 pb-safe text-foreground/80 font-medium"
    >
      <div class="max-w-3xl mx-auto space-y-8 pb-12">
      <template v-if="locale === 'de'">
        <section class="space-y-4">
          <h2 class="text-2xl font-bold text-foreground">Nutzungsbedingungen</h2>
          <p class="text-sm italic">Stand: 27. November 2026</p>
          <p>
            Diese Nutzungsbedingungen regeln die Nutzung der Anwendung <strong>Gainz AI</strong>
            (nachfolgend „App“) zwischen Ihnen als Nutzer und dem Anbieter.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">1. Geltungsbereich &amp; Anbieter</h2>
          <div class="bg-white/5 border border-white/5 rounded-xl p-4 font-mono text-sm">
            Sabahattin Giritli<br />
            Am Kesselhaus 28<br />
            80999 München<br />
            Deutschland<br />
            E-Mail: app.gainz.ai@gmail.com
          </div>
          <p>
            Mit der Anmeldung über Google oder der sonstigen Nutzung der App erklären Sie sich mit
            diesen Nutzungsbedingungen einverstanden.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            2. Leistungsbeschreibung, Abonnement (GainzAI Pro) &amp; Fair-Use-Limits
          </h2>
          <ul class="list-disc pl-5 space-y-2">
            <li>
              <strong>Dauerhaft kostenfreier Kernbereich:</strong> Das manuelle Trainingslogbuch,
              Ihre Trainingshistorie, der Pausentimer, die Google-Drive-Synchronisation sowie
              deterministische Trainingsanalysen (ACWR, e1RM, Volumen-Landmarks, Ermüdungsstatus)
              sind dauerhaft kostenfrei und offline nutzbar – auch ohne aktives Abonnement.
            </li>
            <li>
              <strong>Kostenfreies Starter-Kontingent (FreeAllowance):</strong> Neu angemeldete
              Nutzer erhalten ohne Zeitablauf ein einmaliges Startbudget von <strong>30 KI-Coaching-Anfragen</strong>
              (begrenzt auf maximal 5 Anfragen pro UTC-Tag) sowie <strong>40 Übungsklassifizierungen</strong>
              (begrenzt auf maximal 20 Klassifizierungen pro UTC-Tag).
            </li>
            <li>
              <strong>Einladungscodes (InviteGrant):</strong> Berechtigte Beta-Tester können über
              einen zeitlich begrenzten oder unbefristeten Einladungscode KI-Funktionen im Rahmen
              der täglichen Fair-Use-Limits (15 Coaching- und 50 Klassifizierungs-Anfragen pro UTC-Tag)
              kostenfrei testen.
            </li>
            <li>
              <strong>GainzAI Pro Abonnement &amp; Stripe Managed Payments:</strong> Das kostenpflichtige
              Monatsabonnement <strong>GainzAI Pro</strong> kostet <strong>7,99 € / Monat inkl. MwSt.</strong>
              und schaltet fortlaufendes KI-Coaching und adaptive Trainingsplanung frei
              (Fair-Use-Limit: 15 Coaching- und 50 Klassifizierungs-Anfragen pro UTC-Tag).
              Die Kündigung ist jederzeit monatlich zum Ende des jeweiligen Abrechnungszeitraums über
              das Stripe-Kundenportal möglich. Bei Löschung des Kontos in der App („Konto &amp; Daten
              löschen“) wird ein aktives Abonnement abweichend davon mit sofortiger Wirkung gekündigt
              und der Zugang sofort beendet. Bestellabwicklung, Umsatzsteuer-Berechnung, Belege,
              Zahlungsausfall-Mahnwesen und Rechnungsstellung erfolgen über unseren Merchant of Record
              <strong>Stripe / Link</strong> (erscheint als <code>LINK.COM*</code> auf dem Kontoauszug).
              Bei einer fehlgeschlagenen Verlängerung bleibt der Zugang während einer <strong>3-tägigen
              Kulanzfrist (<code>past_due</code>)</strong> aktiv.
            </li>
            <li>
              <strong>Datenspeicherung bei Ihnen:</strong> Ihre Trainingsprotokolle und Profildaten
              werden lokal auf Ihrem Gerät sowie in Ihrer eigenen Google-Drive-Tabelle gespeichert.
              Hierfür ist ein aktives Google-Konto erforderlich.
            </li>
            <li>
              <strong>Tägliche KI-Kontingente &amp; globale Kapazitätsgrenzen:</strong> Zur
              Vermeidung von Missbrauch und zur Kostenkontrolle unterliegen alle KI-Anfragen
              täglichen Nutzer- und globalen Kapazitätslimits.
            </li>
            <li>
              <strong>Keine Verfügbarkeitsgarantie:</strong> Die App wird ohne Anspruch auf
              unterbrechungsfreie Verfügbarkeit oder bestimmte Funktionen bereitgestellt und kann
              jederzeit weiterentwickelt oder angepasst werden.
            </li>
          </ul>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            3. Kein Medizinprodukt / Gesundheits- und Trainingshinweis
          </h2>
          <div class="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-2">
            <p class="font-bold text-orange-400">
              Wichtiger Gesundheitshinweis – keine medizinische Beratung
            </p>
            <p class="text-sm text-foreground/90">
              Gainz AI ist <strong>kein Medizinprodukt</strong> und bietet
              <strong>keine ärztliche, physiotherapeutische oder sportmedizinische Beratung</strong>,
              Diagnose oder Therapie. Alle Kennzahlen (z. B. ACWR, e1RM, Volumen-Landmarks,
              Ermüdungs- oder Deload-Empfehlungen) dienen ausschließlich allgemeinen Informations-
              und Dokumentationszwecken.
            </p>
            <p class="text-sm text-foreground/90">
              Die Durchführung sämtlicher Übungen und Trainingspläne erfolgt
              <strong>auf eigene Gefahr</strong>. Bei Schmerzen, Verletzungen, akuten Erkrankungen,
              Schwangerschaft oder bekannten Vorerkrankungen (insbesondere des Herz-Kreislauf-Systems
              oder des Bewegungsapparats) holen Sie vor Trainingsbeginn oder -fortsetzung zwingend
              ärztlichen Rat ein und brechen Sie das Training bei Beschwerden sofort ab.
            </p>
          </div>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            4. KI-Transparenzhinweis (Art. 50 EU-KI-Verordnung)
          </h2>
          <p>
            Trainingspläne, Coaching-Antworten, Übungsempfehlungen und Muskelklassifizierungen
            werden mithilfe generativer künstlicher Intelligenz (Google Gemini API) erstellt.
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              Sie interagieren im Coach-Bereich mit einem KI-System, nicht mit einem menschlichen
              Trainer oder Arzt.
            </li>
            <li>
              KI-Ausgaben können fehlerhaft, unvollständig oder für Ihre individuelle körperliche
              Verfassung ungeeignet sein (z. B. fehlerhafte Gewichts-, Wiederholungs- oder
              RPE-Vorschläge).
            </li>
            <li>
              Prüfen Sie jede KI-Empfehlung vor der Ausführung eigenverantwortlich auf
              Plausibilität, saubere Technik und Sicherheit.
            </li>
          </ul>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">5. Mindestalter</h2>
          <p>
            Die Nutzung der App ist Personen ab <strong>16 Jahren</strong> gestattet. Personen unter
            16 Jahren dürfen die App nur mit ausdrücklicher Einwilligung ihrer
            Erziehungsberechtigten nutzen.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            6. Pflichten der Nutzer &amp; Datensicherung
          </h2>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              Eine automatisierte Nutzung (z. B. Scraping, Bots), das Umgehen von Rate-Limits oder
              jegliche missbräuchliche Belastung des Backends ist untersagt.
            </li>
            <li>
              Für die Sicherung Ihrer in Google Drive gespeicherten Tabellen sind Sie selbst
              verantwortlich.
            </li>
          </ul>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">7. Haftungsbeschränkung</h2>
          <p>
            Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, für Schäden aus der
            Verletzung des Lebens, des Körpers oder der Gesundheit sowie nach den Vorschriften des
            Produkthaftungsgesetzes.
          </p>
          <p>
            Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten (Kardinalpflichten)
            ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen
            ist eine Haftung für leichte Fahrlässigkeit ausgeschlossen. Soweit die App unentgeltlich
            bereitgestellt wird, gelten ergänzend die gesetzlichen Haftungsbeschränkungen (insb.
            §§ 521, 599 BGB).
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">8. Datenschutz &amp; Widerruf</h2>
          <p>
            Informationen zur Verarbeitung Ihrer personenbezogenen und freiwilligen
            gesundheitsbezogenen Daten, zur jederzeit möglichen Löschung Ihres Kontos bzw. Ihrer
            App-Daten sowie zum Widerruf Ihrer Einwilligung finden Sie in unserer
            <RouterLink to="/privacy" class="text-primary hover:underline font-semibold"
              >Datenschutzerklärung</RouterLink
            >.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            9. Änderungen &amp; Anwendbares Recht
          </h2>
          <p>
            Wir behalten uns vor, diese Nutzungsbedingungen bei berechtigtem Anlass anzupassen. Bei
            wesentlichen Änderungen werden Sie vor der weiteren Nutzung erneut um Zustimmung gebeten.
          </p>
          <p>
            Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.
            Zwingende Verbraucherschutzvorschriften des Staates, in dem Sie Ihren gewöhnlichen
            Aufenthalt haben, bleiben unberührt.
          </p>
        </section>
      </template>

      <template v-else>
        <section class="space-y-4">
          <h2 class="text-2xl font-bold text-foreground">Terms of Use</h2>
          <p class="text-sm italic">Last Updated: November 27, 2026</p>
          <p>
            These Terms of Use govern your use of the <strong>Gainz AI</strong> application
            (hereinafter "App") provided by the operator listed below.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">1. Scope &amp; Provider</h2>
          <div class="bg-white/5 border border-white/5 rounded-xl p-4 font-mono text-sm">
            Sabahattin Giritli<br />
            Am Kesselhaus 28<br />
            80999 Munich<br />
            Germany<br />
            Email: app.gainz.ai@gmail.com
          </div>
          <p>
            By signing in with Google or using the App, you agree to these Terms of Use.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            2. Service Scope, Subscriptions (GainzAI Pro) &amp; Fair-Use Limits
          </h2>
          <ul class="list-disc pl-5 space-y-2">
            <li>
              <strong>Permanently Free Core:</strong> Manual workout logging, full training history,
              the rest timer, Google Drive spreadsheet sync, and deterministic sports-science insights
              (ACWR, e1RM, volume landmarks, fatigue/deload indicators) remain permanently free and
              offline-capable without an active subscription.
            </li>
            <li>
              <strong>Starter Budget (FreeAllowance):</strong> Newly signed-in athletes receive a
              one-time complimentary budget of <strong>30 AI coaching requests</strong> (capped at 5
              coaching requests per UTC day) plus <strong>40 background exercise classifications</strong>
              (capped at 20 classifications per UTC day), with no calendar expiration.
            </li>
            <li>
              <strong>Invitation Codes (InviteGrant):</strong> Eligible beta testers may redeem a
              time-limited or ongoing invitation code for complimentary AI coaching within daily
              fair-use limits (15 coaching and 50 classification requests per UTC day).
            </li>
            <li>
              <strong>GainzAI Pro Subscription &amp; Stripe Managed Payments:</strong> The optional
              <strong>GainzAI Pro</strong> monthly subscription is billed at <strong>€7.99 / month
              incl. VAT</strong> (cancellable monthly to the end of the billing period via the
              Stripe Customer Portal) and unlocks ongoing AI coaching and adaptive training planning
              under daily fair-use limits (15 coaching and 50 classification requests per UTC day).
              Deleting your account inside the app (“Delete Account &amp; Data”) cancels an active
              subscription with immediate effect rather than at period end, ending subscription access
              right away. Checkout, VAT calculation, customer invoices/receipts, dunning retries,
              and self-service cancellation are processed via <strong>Stripe / Link</strong> acting
              as Merchant of Record (appearing as <code>LINK.COM*</code> on statements). Failed
              renewal payments receive a <strong>3-day grace period (<code>past_due</code>)</strong>
              before AI features pause.
            </li>
            <li>
              <strong>User-Controlled Storage:</strong> Your training logs and profile are stored
              locally on your device and in your own Google Drive spreadsheet. A Google account is
              required for cloud sync and AI requests.
            </li>
            <li>
              <strong>Daily AI Quotas &amp; Global Limits:</strong> To prevent abuse and manage
              operating costs, AI coaching and exercise classification requests are subject to daily
              per-user and global capacity limits.
            </li>
            <li>
              <strong>No Uptime Guarantee:</strong> The App is provided "as is" without any
              guarantee of uninterrupted availability and may be modified at any time.
            </li>
          </ul>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            3. Not a Medical Device / Health &amp; Training Disclaimer
          </h2>
          <div class="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-2">
            <p class="font-bold text-orange-400">
              Important Health Notice — No Medical Advice
            </p>
            <p class="text-sm text-foreground/90">
              Gainz AI is <strong>not a medical device</strong> and does
              <strong>not provide medical, physical therapy, or sports medicine advice</strong>,
              diagnosis, or treatment. All metrics (such as ACWR, e1RM, volume landmarks, fatigue
              scores, and deload suggestions) are for general informational and tracking purposes
              only.
            </p>
            <p class="text-sm text-foreground/90">
              You perform all workouts and training plans <strong>at your own risk</strong>. Consult
              a qualified physician before starting or continuing exercise if you experience pain,
              injuries, acute illness, pregnancy, or pre-existing medical conditions, and stop
              training immediately if discomfort occurs.
            </p>
          </div>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            4. AI Transparency Notice (EU AI Act Art. 50)
          </h2>
          <p>
            Training plans, coaching messages, workout prescriptions, and muscle classifications are
            generated by artificial intelligence (Google Gemini API).
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              In the Coach tab, you are interacting with an AI system, not a human coach or doctor.
            </li>
            <li>
              AI outputs may contain errors, inaccuracies, or unsuitable recommendations for your
              individual condition (e.g., inappropriate weights, reps, or RPE targets).
            </li>
            <li>
              You are responsible for reviewing every AI-generated exercise, load, and suggestion
              for safety and suitability before training.
            </li>
          </ul>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">5. Minimum Age</h2>
          <p>
            This App is intended for users aged <strong>16 and older</strong>. Users under 16 may
            only use the App with explicit consent from a parent or legal guardian.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            6. User Obligations &amp; Backups
          </h2>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              Automated abuse, scraping, attempting to bypass rate limits, or interfering with
              backend services is prohibited.
            </li>
            <li>
              You remain solely responsible for backing up your spreadsheets stored in Google Drive.
            </li>
          </ul>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">7. Limitation of Liability</h2>
          <p>
            We are liable without limitation for intent and gross negligence, for injury to life,
            body, or health, and under mandatory product liability laws.
          </p>
          <p>
            In cases of slight negligence involving a breach of essential contractual obligations
            (cardinal duties), liability is limited to foreseeable, typical damages. Otherwise,
            liability for slight negligence is excluded. Where the App is provided free of charge,
            statutory liability privileges for gratuitous services (e.g., §§ 521, 599 German Civil
            Code / BGB) apply additionally.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            8. Privacy, Erasure &amp; Consent Withdrawal
          </h2>
          <p>
            Details on how personal and optional health-related data are processed, how to delete
            your account and app data at any time, and how to withdraw consent are set out in our
            <RouterLink to="/privacy" class="text-primary hover:underline font-semibold"
              >Privacy Policy</RouterLink
            >.
          </p>
        </section>

        <section class="space-y-4">
          <h2 class="text-xl font-semibold text-foreground">
            9. Amendments &amp; Governing Law
          </h2>
          <p>
            We may update these Terms of Use when justified. For material changes, you will be asked
            to review and accept the updated terms before continuing to use the App.
          </p>
          <p>
            The laws of the Federal Republic of Germany apply, excluding the UN Convention on
            Contracts for the International Sale of Goods (CISG). Mandatory consumer protection laws
            of your country of residence remain unaffected.
          </p>
        </section>
      </template>
      </div>
    </main>
  </div>
</template>
