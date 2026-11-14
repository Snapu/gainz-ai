<script setup lang="ts">
import { useRouter } from "vue-router";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";

const router = useRouter();
</script>

<template>
  <div class="h-full bg-background flex flex-col overflow-hidden">
    <AppHeader show-back title="Privacy Policy" class="shrink-0" @back="router.back()" />
    
    <main class="flex-1 overflow-y-auto overscroll-y-contain p-6 text-foreground/80 space-y-8 max-w-3xl mx-auto">
      <section class="space-y-4">
        <h2 class="text-2xl font-bold text-foreground">Datenschutzerklärung / Privacy Policy</h2>
        <p class="text-sm italic">Letzte Aktualisierung / Last Updated: 12. November 2026</p>
        <p>
          Diese Datenschutzerklärung gilt für die Gainz AI App (nachfolgend "App" oder "Anwendung") 
          und erläutert, welche personenbezogenen Daten wir erheben, wie wir diese verarbeiten 
          und welche Rechte Sie haben.
        </p>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">1. Verantwortlicher / Controller</h2>
        <div class="bg-white/5 rounded-xl p-4 font-mono text-sm">
          Sabahattin Giritli<br />
          Am Kesselhaus 28<br />
          80999 München<br />
          Deutschland<br />
          E-Mail: app.gainz.ai@gmail.com
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-foreground">2. Erhobene Daten / Data Collection</h2>
        
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
            <li><strong>Datenschutzerklärung:</strong> <a href="https://sentry.io/privacy/" target="_blank" class="text-primary hover:underline">https://sentry.io/privacy/</a></li>
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
              <li><strong>Datenschutzerklärung:</strong> <a href="https://policies.google.com/privacy" target="_blank" class="text-primary hover:underline">https://policies.google.com/privacy</a></li>
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
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" class="text-primary hover:underline">Google API Services User Data Policy</a>, 
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
              <li><strong>Datenschutzerklärung:</strong> <a href="https://policies.google.com/privacy" target="_blank" class="text-primary hover:underline">https://policies.google.com/privacy</a></li>
              <li><strong>API Terms of Service:</strong> <a href="https://ai.google.dev/gemini-api/terms" target="_blank" class="text-primary hover:underline">https://ai.google.dev/gemini-api/terms</a></li>
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
            <li><strong>Datenschutzerklärung:</strong> <a href="https://supabase.com/privacy" target="_blank" class="text-primary hover:underline">https://supabase.com/privacy</a></li>
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
            <li><strong>Datenschutzerklärung:</strong> <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" class="text-primary hover:underline">https://www.cloudflare.com/privacypolicy/</a></li>
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
    </main>
  </div>
</template>
