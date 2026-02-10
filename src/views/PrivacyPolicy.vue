<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/exercise-logs" />
        </ion-buttons>
        <ion-title>Datenschutzerklärung</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="privacy-content">
        <h1>Datenschutzerklärung / Privacy Policy</h1>
        <p><strong>Letzte Aktualisierung / Last Updated:</strong> 10. Februar 2026</p>

        <p>Diese Datenschutzerklärung gilt für die Gainz AI App (nachfolgend "App" oder "Anwendung") und erläutert, welche personenbezogenen Daten wir erheben, wie wir diese verarbeiten und welche Rechte Sie haben.</p>

        <h2>1. Verantwortlicher / Controller</h2>
        <pre>
Sabahattin Giritli
Am Kesselhaus 28
80999 München
Deutschland
E-Mail: app.gainz.ai@gmail.com
        </pre>

        <h2>2. Erhobene Daten / Data Collection</h2>

        <h3>2.1 Daten, die Sie direkt bereitstellen</h3>
        <p>Im Rahmen der Nutzung der App werden folgende Daten lokal auf Ihrem Gerät und ggf. in Ihrer Google Drive Tabelle gespeichert:</p>

        <h4>Benutzerprofil (User Profile)</h4>
        <ul>
          <li><strong>Alter</strong> (age)</li>
          <li><strong>Körpergröße in cm</strong> (heightCm)</li>
          <li><strong>Gewicht in kg</strong> (weightKg)</li>
          <li><strong>Fitnessziele</strong> (fitnessGoal): z.B. Muskelaufbau, Fettabbau, Ausdauerverbesserung</li>
          <li><strong>Fitnesslevel</strong> (fitnessLevel): Anfänger, Fortgeschritten, Experte</li>
          <li><strong>Trainingstage pro Woche</strong> (workoutDaysPerWeek)</li>
          <li><strong>Trainingsort</strong> (workoutLocation): Fitnessstudio, Zuhause, Beides</li>
          <li><strong>Verfügbare Ausrüstung</strong> (equipmentAccess): z.B. Hanteln, Klimmzugstange, etc.</li>
          <li><strong>Freitextangaben</strong> (freeUserInput): zusätzliche Informationen, die Sie freiwillig bereitstellen</li>
          <li><strong>Google Generative AI API-Schlüssel</strong> (apiKey): falls von Ihnen bereitgestellt</li>
        </ul>

        <h4>Trainingsprotokoll (Exercise Logs)</h4>
        <ul>
          <li><strong>Übungsname</strong> (exerciseName)</li>
          <li><strong>Datum und Uhrzeit</strong> der Übung (loggedAt)</li>
          <li><strong>Sätze, Wiederholungen, Gewicht</strong> und andere trainingsrelevante Daten</li>
          <li><strong>Eindeutige ID</strong> zur Identifikation des Eintrags</li>
        </ul>

        <h3>2.2 Automatisch erhobene Daten</h3>
        <h4>Lokale Speicherung (LocalStorage)</h4>
        <p>Die App speichert Daten im lokalen Speicher Ihres Browsers/Geräts:</p>
        <ul>
          <li>Benutzerprofildaten</li>
          <li>Trainingsprotokoll-Einträge</li>
          <li>Google OAuth Access Token und Ablaufzeit</li>
          <li>Setup-Status</li>
          <li>KI-Unterhaltungen (begrenzt auf 7 Tage)</li>
        </ul>

        <h3>2.3 Keine Datenerhebung auf eigenen Servern</h3>
        <p><strong>Wichtig:</strong> Die App speichert keine Daten auf eigenen Servern des Anbieters. Alle Daten werden ausschließlich:</p>
        <ul>
          <li>lokal auf Ihrem Gerät (LocalStorage)</li>
          <li>in Ihrer eigenen Google Drive Tabelle (Google Spreadsheets)</li>
          <li>bei Nutzung der KI-Funktionen an Google Generative AI gesendet</li>
        </ul>

        <h2>3. Zweck und Rechtsgrundlage der Verarbeitung</h2>

        <h3>3.1 Bereitstellung der App-Funktionalität</h3>
        <p><strong>Zweck:</strong> Verwaltung Ihres Fitnessprofils, Tracking von Trainingseinheiten, Erstellung personalisierter Trainingspläne</p>
        <p><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</p>

        <h3>3.2 KI-gestützte Trainingsempfehlungen</h3>
        <p><strong>Zweck:</strong> Bereitstellung personalisierter Trainingsempfehlungen durch Google Generative AI</p>
        <p><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</p>
        <p><strong>Datenübermittlung:</strong> Ihre Profildaten und Trainingsprotokolle werden an Google Generative AI (Google LLC, USA) übertragen, um KI-basierte Empfehlungen zu generieren.</p>

        <h3>3.3 Google Drive / Spreadsheets Integration</h3>
        <p><strong>Zweck:</strong> Speicherung und Synchronisation Ihrer Trainingsdaten in Ihrer eigenen Google Drive Tabelle</p>
        <p><strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</p>
        <p><strong>Erforderliche Berechtigungen:</strong></p>
        <ul>
          <li>Zugriff auf Google Spreadsheets</li>
          <li>Zugriff auf Google Drive (Metadaten und Dateierstellung)</li>
        </ul>

        <h2>4. Datenübermittlung an Dritte</h2>

        <h3>4.1 Google LLC (Alphabet Inc.)</h3>
        <p>Die App nutzt folgende Google-Dienste:</p>

        <h4>Google OAuth 2.0 / Google Login</h4>
        <ul>
          <li><strong>Zweck:</strong> Authentifizierung und Autorisierung für Google Drive Zugriff</li>
          <li><strong>Übermittelte Daten:</strong> Access Token, Berechtigungsumfang (Scopes)</li>
          <li><strong>Datenschutzerklärung:</strong> <a href="https://policies.google.com/privacy" target="_blank">https://policies.google.com/privacy</a></li>
        </ul>

        <h4>Google Drive / Google Spreadsheets</h4>
        <ul>
          <li><strong>Zweck:</strong> Speicherung Ihrer Trainingsdaten</li>
          <li><strong>Übermittelte Daten:</strong> Alle Trainingsprotokolle und zugehörige Daten</li>
          <li><strong>Speicherort:</strong> Ihre eigene Google Drive Tabelle</li>
          <li><strong>Kontrolle:</strong> Sie behalten die volle Kontrolle über diese Daten in Ihrem Google Drive</li>
        </ul>

        <h4>Google Generative AI (Gemini API)</h4>
        <ul>
          <li><strong>Zweck:</strong> KI-gestützte Trainingsempfehlungen und Feedback</li>
          <li><strong>Übermittelte Daten:</strong> Ihr Benutzerprofil, Ihre Trainingsprotokolle, Sprach-/Locale-Einstellungen, Aktuelles Datum</li>
          <li><strong>API-Schlüssel:</strong> Sie müssen Ihren eigenen Google Generative AI API-Schlüssel bereitstellen</li>
          <li><strong>Datenschutzerklärung:</strong> <a href="https://policies.google.com/privacy" target="_blank">https://policies.google.com/privacy</a></li>
          <li><strong>API Terms of Service:</strong> <a href="https://ai.google.dev/gemini-api/terms" target="_blank">https://ai.google.dev/gemini-api/terms</a></li>
        </ul>

        <h3>4.2 Übermittlung in Drittländer</h3>
        <p><strong>USA:</strong> Datenübermittlung an Google LLC in den USA erfolgt auf Grundlage der EU-Standardvertragsklauseln und des EU-US Data Privacy Framework.</p>
        <p><strong>Risiken:</strong> Die Übermittlung von Daten in die USA kann mit Risiken verbunden sein, da US-Behörden unter bestimmten Umständen Zugriff auf Ihre Daten haben könnten.</p>

        <h2>5. Speicherdauer</h2>

        <h3>5.1 Lokale Daten</h3>
        <ul>
          <li><strong>Benutzerprofil:</strong> Bis zur Löschung durch Sie (z.B. durch Löschen der Browser-Daten)</li>
          <li><strong>Trainingsprotokolle:</strong> Bis zur Löschung durch Sie</li>
          <li><strong>Access Tokens:</strong> Bis zum Ablauf oder zur Abmeldung</li>
          <li><strong>KI-Unterhaltungen:</strong> Automatische Löschung nach 7 Tagen</li>
        </ul>

        <h3>5.2 Google Drive Daten</h3>
        <p>Ihre in Google Drive gespeicherten Daten unterliegen Ihrer Kontrolle. Sie können diese jederzeit selbst löschen.</p>

        <h3>5.3 Bei Google Generative AI</h3>
        <p>Google speichert übermittelte Daten gemäß den Generative AI API Terms of Service.</p>

        <h2>6. Ihre Rechte</h2>
        <p>Sie haben folgende Rechte gemäß DSGVO:</p>

        <h3>6.1 Auskunftsrecht (Art. 15 DSGVO)</h3>
        <p>Sie haben das Recht, Auskunft über Ihre von uns verarbeiteten personenbezogenen Daten zu verlangen.</p>

        <h3>6.2 Berichtigungsrecht (Art. 16 DSGVO)</h3>
        <p>Sie haben das Recht, die Berichtigung unrichtiger oder die Vervollständigung Ihrer gespeicherten Daten zu verlangen.</p>

        <h3>6.3 Löschungsrecht (Art. 17 DSGVO)</h3>
        <p>Sie haben das Recht auf Löschung Ihrer personenbezogenen Daten ("Recht auf Vergessenwerden").</p>
        <p><strong>So löschen Sie Ihre Daten:</strong></p>
        <ul>
          <li><strong>Lokale Daten:</strong> Löschen Sie den Browser-Cache und die LocalStorage-Daten</li>
          <li><strong>Google Drive Daten:</strong> Löschen Sie die entsprechende Tabelle in Ihrem Google Drive</li>
          <li><strong>Google Generative AI:</strong> Kontaktieren Sie Google gemäß deren Datenschutzrichtlinien</li>
        </ul>

        <h3>6.4 Einschränkung der Verarbeitung (Art. 18 DSGVO)</h3>
        <p>Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer personenbezogenen Daten zu verlangen.</p>

        <h3>6.5 Datenübertragbarkeit (Art. 20 DSGVO)</h3>
        <p>Sie haben das Recht, die Sie betreffenden personenbezogenen Daten in einem strukturierten, gängigen und maschinenlesbaren Format zu erhalten.</p>

        <h3>6.6 Widerspruchsrecht (Art. 21 DSGVO)</h3>
        <p>Sie haben das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit gegen die Verarbeitung Sie betreffender personenbezogener Daten Widerspruch einzulegen.</p>

        <h3>6.7 Widerruf der Einwilligung (Art. 7 Abs. 3 DSGVO)</h3>
        <p>Sie können Ihre erteilte Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen.</p>

        <h3>6.8 Beschwerderecht (Art. 77 DSGVO)</h3>
        <p>Sie haben das Recht, sich bei einer Aufsichtsbehörde zu beschweren.</p>

        <h2>7. Datensicherheit</h2>
        <p>Wir setzen technische und organisatorische Maßnahmen ein, um Ihre Daten zu schützen:</p>
        <ul>
          <li><strong>Verschlüsselung:</strong> HTTPS-Verbindungen für alle Datenübertragungen</li>
          <li><strong>OAuth 2.0:</strong> Sichere Authentifizierung ohne Speicherung Ihres Google-Passworts</li>
          <li><strong>Lokale Speicherung:</strong> Daten werden primär lokal auf Ihrem Gerät gespeichert</li>
          <li><strong>Keine zentralen Server:</strong> Wir betreiben keine zentralen Server zur Speicherung Ihrer Trainingsdaten</li>
          <li><strong>Access Token Management:</strong> Kurze Gültigkeitsdauer der Access Tokens</li>
        </ul>

        <h2>8. Cookies und ähnliche Technologien</h2>
        <p>Die App nutzt <strong>LocalStorage</strong> (Browser-Speicher) zur Speicherung von Benutzerprofil, Trainingsprotokollen, Authentifizierungstokens und App-Einstellungen.</p>
        <p><strong>Service Worker / PWA:</strong> Die App kann als PWA installiert werden und nutzt Service Worker für Offline-Funktionalität.</p>

        <h2>9. Minderjährige</h2>
        <p>Die App richtet sich an Personen ab 16 Jahren. Personen unter 16 Jahren dürfen die App nur mit Zustimmung eines Erziehungsberechtigten nutzen.</p>

        <h2>10. Änderungen der Datenschutzerklärung</h2>
        <p>Wir behalten uns vor, diese Datenschutzerklärung anzupassen. Die aktuelle Fassung ist stets in der App verfügbar.</p>

        <h2>11. Kontakt</h2>
        <pre>
E-Mail: app.gainz.ai@gmail.com
Postanschrift:
Sabahattin Giritli
Am Kesselhaus 28
80999 München
Deutschland
        </pre>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
</script>

<style scoped>
.privacy-content {
  max-width: 800px;
  margin: 0 auto;
}
</style>
