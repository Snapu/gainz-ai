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
    <AppHeader show-back :title="t('legal.privacyTitle')" class="shrink-0" @back="router.back()" />
    
    <main class="flex-1 overflow-y-auto overscroll-y-contain p-6 text-foreground/80 space-y-8 max-w-3xl mx-auto">
      <template v-if="locale === 'de'">
      <section class="space-y-4">
        <h2 class="text-2xl font-bold text-foreground">Datenschutzerklärung</h2>
        <p class="text-sm italic">Letzte Aktualisierung: 12. November 2026</p>
        <p>
          Diese Datenschutzerklärung gilt für die Gainz AI App (nachfolgend "App" oder "Anwendung") 
          und erläutert, welche personenbezogenen Daten wir erheben, wie wir diese verarbeiten 
          und welche Rechte Sie haben.
        </p>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">1. Verantwortlicher</h2>
        <div class="bg-white/5 rounded-xl p-4 font-mono text-sm">
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
          <h3 class="text-lg font-medium text-foreground">2.1 Daten, die Sie direkt bereitstellen</h3>
          <p>Im Rahmen der Nutzung der App werden folgende Daten lokal auf Ihrem Gerät und ggf. in Ihrer Google Drive Tabelle gespeichert:</p>
          
          <div class="space-y-2">
            <h4 class="font-medium text-foreground">Benutzerprofil (User Profile)</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Alter</strong> (age)</li>
              <li><strong>Körpergröße in cm</strong> (heightCm)</li>
              <li><strong>Gewicht in kg</strong> (weightKg)</li>
              <li><strong>Fitnessziele</strong> (fitnessGoal): z.B. Muskelaufbau, Fettabbau, Ausdauerverbesserung</li>
              <li><strong>Fitnesslevel</strong> (fitnessLevel): Anfänger, Fortgeschritten, Experte</li>
              <li><strong>Trainingstage pro Woche</strong> (workoutDaysPerWeek)</li>
              <li><strong>Trainingsdauer in Minuten</strong> (workoutDurationMinutes)</li>
              <li><strong>Trainingsort</strong> (workoutLocation): Fitnessstudio, Zuhause, Beides</li>
              <li><strong>Verfügbare Ausrüstung</strong> (equipmentAccess): z.B. Hanteln, Klimmzugstange, etc.</li>
              <li><strong>Freitextangaben</strong> (freeUserInput): zusätzliche Informationen, die Sie freiwillig bereitstellen</li>
            </ul>
          </div>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground">Trainingsprotokoll (Exercise Logs)</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Übungsname</strong> (exerciseName)</li>
              <li><strong>Datum und Uhrzeit</strong> der Übung (loggedAt)</li>
              <li><strong>Sätze, Wiederholungen, Gewicht</strong> und andere trainingsrelevante Daten</li>
              <li><strong>Eindeutige ID</strong> zur Identifikation des Eintrags</li>
            </ul>
          </div>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">2.2 Automatisch erhobene Daten</h3>
          <h4 class="font-medium text-foreground">Lokale und gerätespezifische Speicherung</h4>
          <p>Die App speichert Daten im lokalen Speicher Ihres Browsers bzw. im sicheren Gerätespeicher (LocalStorage im Web, native Preferences auf iOS/Android):</p>
          <ul class="list-disc pl-5 space-y-1">
            <li>Benutzerprofildaten</li>
            <li>Trainingsprotokoll-Einträge</li>
            <li>Google OAuth Access Token, Refresh Token und Ablaufzeit</li>
            <li>Setup-Status</li>
            <li>KI-Unterhaltungen (begrenzt auf 7 Tage)</li>
          </ul>
        </div>

        <div class="space-y-2 border-l-2 border-primary/50 pl-4 py-2 bg-primary/5">
          <h3 class="text-lg font-medium text-foreground">2.3 Speicherung und Backend-Verarbeitung</h3>
          <p><strong>Wichtig:</strong> Ihre Trainingsprotokolle und Ihr Benutzerprofil werden nicht dauerhaft auf Servern des Anbieters gespeichert, sondern verbleiben:</p>
          <ul class="list-disc pl-5 space-y-1 font-medium">
            <li>lokal auf Ihrem Gerät (LocalStorage)</li>
            <li>in Ihrer eigenen Google Drive Tabelle (Google Spreadsheets)</li>
          </ul>
          <p class="text-sm mt-2">
            Für den OAuth-Token-Austausch, die Weiterleitung von KI-Anfragen an Google Generative AI sowie zur Durchsetzung täglicher Nutzungslimits (Rate-Limiting anhand Ihrer pseudonymen Google-Konto-ID und eines Tageszählers) nutzt die App ein Backend auf Basis von <strong>Supabase</strong> (Hosting-Region EU Central / Frankfurt am Main, Deutschland).
          </p>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">3. Zweck und Rechtsgrundlage der Verarbeitung</h2>
        
        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">3.1 Bereitstellung der App-Funktionalität</h3>
          <p><strong>Zweck:</strong> Verwaltung Ihres Fitnessprofils, Tracking von Trainingseinheiten, Erstellung personalisierter Trainingspläne</p>
          <p><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</p>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">3.2 KI-gestützte Trainingsempfehlungen</h3>
          <p><strong>Zweck:</strong> Bereitstellung personalisierter Trainingsempfehlungen durch Google Generative AI</p>
          <p><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</p>
          <p><strong>Datenübermittlung:</strong> Ihre Profildaten und Trainingsprotokolle werden an Google Generative AI (Google LLC, USA) übertragen, um KI-basierte Empfehlungen zu generieren.</p>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">3.3 Google Drive Integration & Scopes</h3>
          <p><strong>Zweck:</strong> Speicherung und Synchronisation Ihrer Trainingsdaten in Ihrer eigenen Google Drive Tabelle</p>
          <p><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</p>
          <p class="font-medium">Erforderliche Berechtigungen (OAuth Scopes):</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><code>https://www.googleapis.com/auth/drive.file</code>: Erstellen und Bearbeiten ausschließlich von Dateien, die von Gainz AI erstellt oder durch den Nutzer explizit mit der App geöffnet wurden (kein Vollzugriff auf Ihr Google Drive oder fremde Dateien).</li>
            <li><code>openid</code>: Sichere Authentifizierung und kryptografische Validierung Ihres Google-Kontos für das serverseitige Rate-Limiting.</li>
          </ul>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">4. Datenübermittlung an Dritte</h2>
        
        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">4.1 Sentry (Fehlerüberwachung)</h3>
          <p>Die App nutzt Sentry zur technischen Fehlerüberwachung und Stabilitätsverbesserung.</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Anbieter:</strong> Functional Software, Inc., 45 Fremont Street, 8th Floor, San Francisco, CA 94105, USA</li>
            <li><strong>Zweck:</strong> Erkennung und Behebung technischer Fehler</li>
            <li><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Fehleranalyse und App-Stabilität)</li>
            <li><strong>Datenstandort:</strong> EU (Deutschland)</li>
            <li><strong>Übermittelte Daten:</strong> Fehlermeldungen, Stack Traces, Browser-/Geräteinformationen (User Agent), HTTP-Request-URLs, Konsolenmeldungen, Referrer-URL</li>
            <li><strong>Nicht übermittelte Daten:</strong> IP-Adressen, Cookies, E-Mail-Adressen, Benutzernamen</li>
            <li><strong>Datenschutzerklärung:</strong> <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://sentry.io/privacy/</a></li>
          </ul>
        </div>

        <div class="space-y-4">
          <h3 class="text-lg font-medium text-foreground">4.2 Google LLC (Alphabet Inc.)</h3>
          <p>Die App nutzt folgende Google-Dienste:</p>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground underline decoration-primary/30">Google OAuth 2.0 / Google Login</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Zweck:</strong> Authentifizierung und Autorisierung für Google Drive Zugriff</li>
              <li><strong>Übermittelte Daten:</strong> Access Token, Berechtigungsumfang (Scopes)</li>
              <li><strong>Datenschutzerklärung:</strong> <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://policies.google.com/privacy</a></li>
            </ul>
          </div>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground underline decoration-primary/30">Google Drive / Google Spreadsheets</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Zweck:</strong> Speicherung Ihrer Trainingsdaten</li>
              <li><strong>Übermittelte Daten:</strong> Alle Trainingsprotokolle und zugehörige Daten</li>
              <li><strong>Speicherort:</strong> Ihre eigene Google Drive Tabelle</li>
              <li><strong>Kontrolle:</strong> Sie behalten die volle Kontrolle über diese Daten in Ihrem Google Drive</li>
            </ul>
            <div class="mt-3 p-3 bg-white/5 rounded-lg border border-white/5 text-xs space-y-1">
              <p class="font-semibold text-foreground">Google API Limited Use Disclosure:</p>
              <p>
                Die Nutzung und Übertragung von Informationen, die Gainz AI über Google-APIs erhält, an andere Apps erfolgt im Einklang mit der 
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Google API Services User Data Policy</a>, 
                einschließlich der Anforderungen an die eingeschränkte Nutzung ("Limited Use").
              </p>
              <p class="italic text-muted-foreground">
                "Gainz AI's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements."
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground underline decoration-primary/30">Google Generative AI (Gemini API)</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Zweck:</strong> KI-gestützte Trainingsempfehlungen, Trainingsplanung und Übungsklassifizierung</li>
              <li><strong>Übermittelte Daten:</strong> Ihr Benutzerprofil, Ihre Trainingsprotokolle, Sprach-/Locale-Einstellungen, Aktuelles Datum</li>
              <li><strong>Übertragungsweg:</strong> Anfragen werden über unser Supabase Backend (Edge Functions) mit dem zentralen API-Schlüssel des Anbieters an die Gemini API weitergeleitet</li>
              <li><strong>Datenschutzerklärung:</strong> <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://policies.google.com/privacy</a></li>
              <li><strong>API Terms of Service:</strong> <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://ai.google.dev/gemini-api/terms</a></li>
            </ul>
          </div>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">4.3 Supabase (Backend, Authentifizierung & Rate-Limiting)</h3>
          <p>Die App nutzt Supabase für serverseitige Edge Functions (OAuth 2.0 Token-Austausch und KI-Anfragen) sowie zur Verwaltung täglicher KI-Nutzungskontingente.</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Anbieter:</strong> Supabase, Inc., 970 Toa Payoh North #07-04, Singapore 318992</li>
            <li><strong>Datenstandort:</strong> EU (Frankfurt am Main, Deutschland – <code>eu-central-1</code>)</li>
            <li><strong>Zweck:</strong> Sicherer OAuth-Token-Austausch, Schutz der KI-Systemanweisungen/API-Schlüssel und Schutz vor Missbrauch durch tägliche Anfrage-Limits</li>
            <li><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an IT-Sicherheit und Kostenkontrolle)</li>
            <li><strong>Gespeicherte Daten:</strong> Pseudonyme Google-Subjekt-ID (<code>sub</code>), Tagesdatum (UTC), Art der Anfrage und Anzahl der täglichen KI-Anfragen in der Tabelle <code>ai_daily_usage</code></li>
            <li><strong>Datenschutzerklärung:</strong> <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://supabase.com/privacy</a></li>
          </ul>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">4.4 Cloudflare Pages (Hosting &amp; CDN)</h3>
          <p>Diese Web-Anwendung wird über Cloudflare Pages bereitgestellt.</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Anbieter:</strong> Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA</li>
            <li><strong>Zweck:</strong> Auslieferung der Web-Anwendung (CDN), DDoS-Schutz und Sicherstellung der technischen Verfügbarkeit</li>
            <li><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an sicherer und performanter Bereitstellung)</li>
            <li><strong>Verarbeitete Daten:</strong> Technische Zugriffsdaten in Edge-Logs (z.B. IP-Adresse, Zeitpunkt des Abrufs, angeforderte URL, User-Agent)</li>
            <li><strong>Datenschutzerklärung:</strong> <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://www.cloudflare.com/privacypolicy/</a></li>
          </ul>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">4.5 Übermittlung in Drittländer</h3>
          <p><strong>USA / Drittländer:</strong> Die Datenübermittlung an Dienstleister mit Sitz oder Muttergesellschaft in den USA (Google LLC, Supabase, Inc., Cloudflare, Inc., Functional Software, Inc. / Sentry) erfolgt auf Grundlage der Standardvertragsklauseln der EU-Kommission (SCCs) sowie, soweit zutreffend, des EU-U.S. Data Privacy Frameworks.</p>
          <p><strong>Risiken:</strong> Die Übermittlung von Daten in die USA kann mit Risiken verbunden sein, da US-Behörden unter bestimmten gesetzlichen Umständen Zugriff auf Daten verlangen könnten.</p>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">5. Speicherdauer</h2>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">5.1 Lokale Daten</h3>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Benutzerprofil:</strong> Bis zur Löschung durch Sie (z.B. durch Löschen der Browser-Daten)</li>
            <li><strong>Trainingsprotokolle:</strong> Bis zur Löschung durch Sie</li>
            <li><strong>Access Tokens:</strong> Bis zum Ablauf oder zur Abmeldung</li>
            <li><strong>KI-Unterhaltungen:</strong> Automatische Löschung nach 7 Tagen</li>
          </ul>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">5.2 Google Drive Daten</h3>
          <p>Ihre in Google Drive gespeicherten Daten unterliegen Ihrer Kontrolle. Sie können diese jederzeit selbst löschen.</p>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">5.3 Sentry</h3>
          <p>Fehlerdaten werden für 90 Tage in Sentry gespeichert und anschließend automatisch gelöscht.</p>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">5.4 Bei Google Generative AI & Supabase</h3>
          <p>Google verarbeitet übermittelte Daten gemäß den Generative AI API Terms of Service. In unserem Supabase-Backend werden ausschließlich pseudonyme Nutzungszähler zur Kontingentprüfung (<code>ai_daily_usage</code>) gespeichert; diese Datensätze werden nach <strong>30 Tagen</strong> automatisch und unwiderruflich gelöscht.</p>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">6. Ihre Rechte</h2>
        <p>Sie haben folgende Rechte gemäß DSGVO:</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground">6.1 Auskunftsrecht (Art. 15 DSGVO)</h3>
            <p>Sie haben das Recht, Auskunft über Ihre von uns verarbeiteten personenbezogenen Daten zu verlangen.</p>
          </div>
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground">6.2 Berichtigungsrecht (Art. 16 DSGVO)</h3>
            <p>Sie haben das Recht, die Berichtigung unrichtiger oder die Vervollständigung Ihrer gespeicherten Daten zu verlangen.</p>
          </div>
        </div>

        <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
          <h3 class="font-medium text-foreground">6.3 Löschungsrecht (Art. 17 DSGVO)</h3>
          <p>Sie haben das Recht auf Löschung Ihrer personenbezogenen Daten ("Recht auf Vergessenwerden").</p>
          <p class="text-sm font-medium">So löschen Sie Ihre Daten:</p>
          <ul class="list-disc pl-5 space-y-1 text-sm">
            <li><strong>Lokale Daten:</strong> Löschen Sie den Browser-Cache und die LocalStorage-Daten</li>
            <li><strong>Google Drive Daten:</strong> Löschen Sie die entsprechende Tabelle in Ihrem Google Drive</li>
            <li><strong>Sentry:</strong> Fehlerdaten werden automatisch nach 90 Tagen gelöscht</li>
            <li><strong>Google Generative AI:</strong> Kontaktieren Sie Google gemäß deren Datenschutzrichtlinien</li>
          </ul>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground text-sm">6.4 Einschränkung der Verarbeitung (Art. 18 DSGVO)</h3>
            <p class="text-sm">Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer personenbezogenen Daten zu verlangen.</p>
          </div>
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground text-sm">6.5 Datenübertragbarkeit (Art. 20 DSGVO)</h3>
            <p class="text-sm">Sie haben das Recht, die Sie betreffenden personenbezogenen Daten in einem Format zu erhalten.</p>
          </div>
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground text-sm">6.6 Widerspruchsrecht (Art. 21 DSGVO)</h3>
            <p class="text-sm">Sie haben das Recht, jederzeit gegen die Verarbeitung Widerspruch einzulegen.</p>
          </div>
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground text-sm">6.7 Widerruf der Einwilligung (Art. 7 Abs. 3 DSGVO)</h3>
            <p class="text-sm">Sie können Ihre erteilte Einwilligung jederzeit widerrufen.</p>
          </div>
        </div>

        <div class="bg-white/5 p-4 rounded-xl border border-white/5">
          <h3 class="font-medium text-foreground">6.8 Beschwerderecht (Art. 77 DSGVO)</h3>
          <p>Sie haben das Recht, sich bei einer Aufsichtsbehörde zu beschweren.</p>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">7. Datensicherheit</h2>
        <p>Wir setzen technische und organisatorische Maßnahmen ein, um Ihre Daten zu schützen:</p>
        <ul class="list-disc pl-5 space-y-1">
          <li><strong>Verschlüsselung:</strong> HTTPS-Verbindungen für alle Datenübertragungen</li>
          <li><strong>OAuth 2.0:</strong> Sichere Authentifizierung ohne Speicherung Ihres Google-Passworts</li>
          <li><strong>Lokale Speicherung:</strong> Daten werden primär lokal auf Ihrem Gerät gespeichert</li>
          <li><strong>Minimale Server-Speicherung:</strong> Ihre Trainingsprotokolle und Profildaten werden ausschließlich lokal und in Ihrem eigenen Google Drive gespeichert; auf dem Backend (Supabase EU) werden nur pseudonyme Tageszähler für KI-Anfragen erfasst</li>
          <li><strong>Access & Refresh Token Management:</strong> Kurze Gültigkeitsdauer der Access Tokens mit sicherem OAuth 2.0 Authorization Code Flow</li>
        </ul>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">8. Cookies und ähnliche Technologien</h2>
        <p>Die App verwendet keine Tracking- oder Werbe-Cookies. Sie nutzt <strong>LocalStorage</strong> (Browser-Speicher im Web) sowie den <strong>app-isolierten nativen App-Speicher</strong> (Capacitor Preferences: UserDefaults unter iOS bzw. SharedPreferences unter Android) zur Speicherung von Benutzerprofil, Trainingsprotokollen, Authentifizierungstokens und App-Einstellungen.</p>
        <p><strong>Service Worker / PWA:</strong> Die App kann als PWA installiert werden und nutzt Service Worker für Offline-Funktionalität.</p>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">9. Minderjährige</h2>
        <p>Die App richtet sich an Personen ab 16 Jahren. Personen unter 16 Jahren dürfen die App nur mit Zustimmung eines Erziehungsberechtigten nutzen.</p>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">10. Änderungen der Datenschutzerklärung</h2>
        <p>Wir behalten uns vor, diese Datenschutzerklärung anzupassen. Die aktuelle Fassung ist stets in der App verfügbar.</p>
      </section>

      <section class="space-y-4 mb-12">
        <h2 class="text-xl font-semibold text-foreground">11. Kontakt</h2>
        <div class="bg-white/5 rounded-xl p-4 font-mono text-sm">
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
        <p class="text-sm italic">Last Updated: November 12, 2026</p>
        <p>
          This Privacy Policy applies to the Gainz AI app (hereinafter "App" or "Application")
          and explains what personal data we collect, how we process it, and what rights you have.
        </p>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">1. Controller</h2>
        <div class="bg-white/5 rounded-xl p-4 font-mono text-sm">
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
          <p>When using the app, the following data is stored locally on your device and, where connected, in your Google Drive spreadsheet:</p>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground">User Profile</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Age</strong> (age)</li>
              <li><strong>Height in cm</strong> (heightCm)</li>
              <li><strong>Weight in kg</strong> (weightKg)</li>
              <li><strong>Fitness goals</strong> (fitnessGoal): e.g. build muscle, lose fat, improve endurance</li>
              <li><strong>Fitness level</strong> (fitnessLevel): beginner, intermediate, advanced</li>
              <li><strong>Workout days per week</strong> (workoutDaysPerWeek)</li>
              <li><strong>Workout duration in minutes</strong> (workoutDurationMinutes)</li>
              <li><strong>Workout location</strong> (workoutLocation): gym, home, both</li>
              <li><strong>Available equipment</strong> (equipmentAccess): e.g. dumbbells, pull-up bar, etc.</li>
              <li><strong>Additional notes</strong> (freeUserInput): extra details you provide voluntarily</li>
            </ul>
          </div>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground">Training Log (Exercise Logs)</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Exercise name</strong> (exerciseName)</li>
              <li><strong>Date and time</strong> of the exercise (loggedAt)</li>
              <li><strong>Sets, reps, weight</strong> and other training-related metrics</li>
              <li><strong>Unique ID</strong> to identify each entry</li>
            </ul>
          </div>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">2.2 Automatically Stored Local Data</h3>
          <h4 class="font-medium text-foreground">Local and Device-Specific Storage</h4>
          <p>The app stores data in your browser's local storage or secure device storage (LocalStorage on web, native Preferences on iOS/Android):</p>
          <ul class="list-disc pl-5 space-y-1">
            <li>User profile data</li>
            <li>Training log entries</li>
            <li>Google OAuth access token, refresh token, and expiration timestamp</li>
            <li>Setup status and language preference</li>
            <li>AI conversations (retained for 7 days)</li>
          </ul>
        </div>

        <div class="space-y-2 border-l-2 border-primary/50 pl-4 py-2 bg-primary/5">
          <h3 class="text-lg font-medium text-foreground">2.3 Storage &amp; Backend Processing</h3>
          <p><strong>Important:</strong> Your training logs and user profile are not permanently stored on the provider's servers. Instead, they remain:</p>
          <ul class="list-disc pl-5 space-y-1 font-medium">
            <li>locally on your device (LocalStorage)</li>
            <li>in your own Google Drive spreadsheet (Google Sheets)</li>
          </ul>
          <p class="text-sm mt-2">
            For OAuth token exchange, forwarding AI requests to Google Generative AI, and enforcing daily usage limits (rate limiting using your pseudonymous Google account ID and a daily counter), the app uses a backend powered by <strong>Supabase</strong> (hosting region EU Central / Frankfurt am Main, Germany).
          </p>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">3. Purpose &amp; Legal Basis of Processing</h2>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">3.1 Providing App Functionality</h3>
          <p><strong>Purpose:</strong> Managing your fitness profile, tracking training sessions, and creating personalized training plans.</p>
          <p><strong>Legal basis:</strong> Art. 6(1)(b) GDPR (performance of a contract) and Art. 6(1)(a) GDPR (consent).</p>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">3.2 AI-Powered Training Recommendations</h3>
          <p><strong>Purpose:</strong> Providing personalized training recommendations powered by Google Generative AI.</p>
          <p><strong>Legal basis:</strong> Art. 6(1)(a) GDPR (consent).</p>
          <p><strong>Data transfer:</strong> Your profile data and training logs are transmitted to Google Generative AI (Google LLC, USA) to generate AI-based coaching recommendations.</p>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">3.3 Google Drive Integration &amp; Scopes</h3>
          <p><strong>Purpose:</strong> Storing and syncing your training data in your own Google Drive spreadsheet.</p>
          <p><strong>Legal basis:</strong> Art. 6(1)(a) GDPR (consent).</p>
          <p class="font-medium">Required permissions (OAuth Scopes):</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><code>https://www.googleapis.com/auth/drive.file</code>: Create and edit only files created by Gainz AI or explicitly opened by you with the app (no full access to your Google Drive or other files).</li>
            <li><code>openid</code>: Secure authentication and cryptographic verification of your Google account for server-side rate limiting.</li>
          </ul>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">4. Third-Party Data Transfers</h2>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">4.1 Sentry (Error Monitoring)</h3>
          <p>The app uses Sentry for technical error monitoring and stability improvements.</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Provider:</strong> Functional Software, Inc., 45 Fremont Street, 8th Floor, San Francisco, CA 94105, USA</li>
            <li><strong>Purpose:</strong> Detecting and resolving technical errors</li>
            <li><strong>Legal basis:</strong> Art. 6(1)(f) GDPR (legitimate interest in error analysis and app stability)</li>
            <li><strong>Data region:</strong> EU (Germany)</li>
            <li><strong>Data transmitted:</strong> Error messages, stack traces, browser/device info (User Agent), HTTP request URLs, console logs, referrer URL</li>
            <li><strong>Data not transmitted:</strong> IP addresses, cookies, email addresses, usernames</li>
            <li><strong>Privacy Policy:</strong> <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://sentry.io/privacy/</a></li>
          </ul>
        </div>

        <div class="space-y-4">
          <h3 class="text-lg font-medium text-foreground">4.2 Google LLC (Alphabet Inc.)</h3>
          <p>The app uses the following Google services:</p>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground underline decoration-primary/30">Google OAuth 2.0 / Google Sign-In</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Purpose:</strong> Authentication and authorization for Google Drive access</li>
              <li><strong>Data transmitted:</strong> Access token, granted scopes</li>
              <li><strong>Privacy Policy:</strong> <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://policies.google.com/privacy</a></li>
            </ul>
          </div>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground underline decoration-primary/30">Google Drive / Google Sheets</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Purpose:</strong> Storing your training data</li>
              <li><strong>Data transmitted:</strong> All training logs and related data</li>
              <li><strong>Storage location:</strong> Your own Google Drive spreadsheet</li>
              <li><strong>Control:</strong> You retain full control over this data in your Google Drive</li>
            </ul>
            <div class="mt-3 p-3 bg-white/5 rounded-lg border border-white/5 text-xs space-y-1">
              <p class="font-semibold text-foreground">Google API Limited Use Disclosure:</p>
              <p>
                Gainz AI's use and transfer to any other app of information received from Google APIs will adhere to the
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Google API Services User Data Policy</a>,
                including the Limited Use requirements.
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <h4 class="font-medium text-foreground underline decoration-primary/30">Google Generative AI (Gemini API)</h4>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>Purpose:</strong> AI-powered training recommendations, workout planning, and exercise classification</li>
              <li><strong>Data transmitted:</strong> Your user profile, training logs, language/locale setting, current date</li>
              <li><strong>Transfer path:</strong> Requests are forwarded to the Gemini API through our Supabase backend (Edge Functions) using the provider's central API key</li>
              <li><strong>Privacy Policy:</strong> <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://policies.google.com/privacy</a></li>
              <li><strong>API Terms of Service:</strong> <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://ai.google.dev/gemini-api/terms</a></li>
            </ul>
          </div>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">4.3 Supabase (Backend, Authentication &amp; Rate Limiting)</h3>
          <p>The app uses Supabase for server-side Edge Functions (OAuth 2.0 token exchange and AI requests) and to manage daily AI usage quotas.</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Provider:</strong> Supabase, Inc., 970 Toa Payoh North #07-04, Singapore 318992</li>
            <li><strong>Data region:</strong> EU (Frankfurt am Main, Germany – <code>eu-central-1</code>)</li>
            <li><strong>Purpose:</strong> Secure OAuth token exchange, protecting AI system instructions/API keys, and abuse prevention via daily request limits</li>
            <li><strong>Legal basis:</strong> Art. 6(1)(b) GDPR (contract performance) and Art. 6(1)(f) GDPR (legitimate interest in IT security and cost control)</li>
            <li><strong>Stored data:</strong> Pseudonymous Google subject ID (<code>sub</code>), calendar day (UTC), request type, and daily AI request count in table <code>ai_daily_usage</code></li>
            <li><strong>Privacy Policy:</strong> <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://supabase.com/privacy</a></li>
          </ul>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">4.4 Cloudflare Pages (Hosting &amp; CDN)</h3>
          <p>This web application is delivered via Cloudflare Pages.</p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Provider:</strong> Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA</li>
            <li><strong>Purpose:</strong> Delivering the web app (CDN), DDoS protection, and ensuring technical availability</li>
            <li><strong>Legal basis:</strong> Art. 6(1)(f) GDPR (legitimate interest in secure, reliable delivery)</li>
            <li><strong>Processed data:</strong> Technical access logs at the edge (e.g., IP address, timestamp, requested URL, User-Agent)</li>
            <li><strong>Privacy Policy:</strong> <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">https://www.cloudflare.com/privacypolicy/</a></li>
          </ul>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">4.5 International Data Transfers</h3>
          <p><strong>USA / Third countries:</strong> Data transfers to service providers established or parent-held in the USA (Google LLC, Supabase, Inc., Cloudflare, Inc., Functional Software, Inc. / Sentry) rely on the European Commission's Standard Contractual Clauses (SCCs) and, where applicable, the EU-U.S. Data Privacy Framework.</p>
          <p><strong>Risks:</strong> Transferring data to the USA carries potential risks, as US authorities may compel access to data under applicable statutory frameworks.</p>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">5. Retention Period</h2>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">5.1 Local Data</h3>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>User profile:</strong> Until deleted by you (e.g. clearing browser storage)</li>
            <li><strong>Training logs:</strong> Until deleted by you</li>
            <li><strong>Access tokens:</strong> Until expiration or sign out</li>
            <li><strong>AI conversations:</strong> Automatically deleted after 7 days</li>
          </ul>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">5.2 Google Drive Data</h3>
          <p>Data stored in your Google Drive remains under your full control and can be deleted by you at any time.</p>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">5.3 Sentry</h3>
          <p>Error records are retained in Sentry for 90 days and then automatically deleted.</p>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-medium text-foreground">5.4 Google Generative AI &amp; Supabase</h3>
          <p>Google processes submitted data under the Generative AI API Terms of Service. Our Supabase backend stores only pseudonymous daily usage counters (<code>ai_daily_usage</code>) for quota checks; those records are automatically and permanently deleted after <strong>30 days</strong>.</p>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">6. Your Rights</h2>
        <p>Under the GDPR, you have the following rights:</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground">6.1 Right of Access (Art. 15 GDPR)</h3>
            <p>You have the right to obtain confirmation and information about your personal data processed by us.</p>
          </div>
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground">6.2 Right to Rectification (Art. 16 GDPR)</h3>
            <p>You have the right to request correction of inaccurate data or completion of incomplete personal data.</p>
          </div>
        </div>

        <div class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
          <h3 class="font-medium text-foreground">6.3 Right to Erasure (Art. 17 GDPR)</h3>
          <p>You have the right to request deletion of your personal data ("right to be forgotten").</p>
          <p class="text-sm font-medium">How to delete your data:</p>
          <ul class="list-disc pl-5 space-y-1 text-sm">
            <li><strong>Local data:</strong> Clear browser cache and LocalStorage data</li>
            <li><strong>Google Drive data:</strong> Delete the spreadsheet in your Google Drive</li>
            <li><strong>Sentry:</strong> Error records are automatically deleted after 90 days</li>
            <li><strong>Google Generative AI:</strong> Contact Google under their privacy policy</li>
          </ul>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground text-sm">6.4 Right to Restriction (Art. 18 GDPR)</h3>
            <p class="text-sm">You have the right to request restriction of processing of your personal data.</p>
          </div>
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground text-sm">6.5 Data Portability (Art. 20 GDPR)</h3>
            <p class="text-sm">You have the right to receive personal data concerning you in a portable format.</p>
          </div>
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground text-sm">6.6 Right to Object (Art. 21 GDPR)</h3>
            <p class="text-sm">You have the right to object at any time to the processing of your personal data.</p>
          </div>
          <div class="bg-white/5 p-4 rounded-xl border border-white/5">
            <h3 class="font-medium text-foreground text-sm">6.7 Withdrawal of Consent (Art. 7(3) GDPR)</h3>
            <p class="text-sm">You may withdraw any previously granted consent at any time.</p>
          </div>
        </div>

        <div class="bg-white/5 p-4 rounded-xl border border-white/5">
          <h3 class="font-medium text-foreground">6.8 Right to Lodge a Complaint (Art. 77 GDPR)</h3>
          <p>You have the right to lodge a complaint with a supervisory data protection authority.</p>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">7. Data Security</h2>
        <p>We implement technical and organizational safeguards to protect your data:</p>
        <ul class="list-disc pl-5 space-y-1">
          <li><strong>Encryption:</strong> HTTPS encryption for all network transmissions</li>
          <li><strong>OAuth 2.0:</strong> Secure authentication without storing your Google password</li>
          <li><strong>Local storage:</strong> Data is stored primarily locally on your device</li>
          <li><strong>Minimal server footprint:</strong> Training logs and profile data stay local and in your own Google Drive; the Supabase EU backend stores only pseudonymous daily AI request counters</li>
          <li><strong>Access &amp; refresh token handling:</strong> Short-lived access tokens via secure OAuth 2.0 Authorization Code flow</li>
        </ul>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">8. Cookies &amp; Similar Technologies</h2>
        <p>This app does not use tracking or advertising cookies. It uses <strong>LocalStorage</strong> (web browser storage) and <strong>app-isolated native storage</strong> (Capacitor Preferences: UserDefaults on iOS / SharedPreferences on Android) to store your profile, training logs, authentication tokens, and app preferences.</p>
        <p><strong>Service Worker / PWA:</strong> The app can be installed as a PWA and uses a Service Worker for offline support.</p>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">9. Minors</h2>
        <p>This app is intended for users aged 16 and older. Users under 16 may only use the app with consent from a parent or legal guardian.</p>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">10. Changes to This Policy</h2>
        <p>We reserve the right to update this Privacy Policy. The current version is always available within the app.</p>
      </section>

      <section class="space-y-4 mb-12">
        <h2 class="text-xl font-semibold text-foreground">11. Contact</h2>
        <div class="bg-white/5 rounded-xl p-4 font-mono text-sm">
          Email: app.gainz.ai@gmail.com<br />
          Postal address:<br />
          Sabahattin Giritli<br />
          Am Kesselhaus 28<br />
          80999 Munich<br />
          Germany
        </div>
      </section>
      </template>
    </main>
  </div>
</template>
