<div align="center">
  <img src="src/ui/assets/logo.png" width="110" alt="Foldria Logo" />
  <h1>Foldria</h1>
  <p><strong>Weniger Chaos. Mehr Überblick.</strong></p>
  <p>Ein eleganter Datei-Sortierer für Windows — mit eigenen Regeln, Vorschau, Duplikatsuche und Rückgängig-Funktion.</p>
  <p><img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-7C61E6?style=flat-square" /> <img alt="Electron" src="https://img.shields.io/badge/Electron-Desktop-B7A0FF?style=flat-square" /> <img alt="Local-first" src="https://img.shields.io/badge/Local--first-100%25-75C9A9?style=flat-square" /></p>
</div>

---

> [!NOTE]
> **Foldria v0.1.0 ist veröffentlicht.** Windows-Installer, portable EXE und SHA-256-Prüfsummen stehen unter [Releases](https://github.com/lavender1510/Foldria/releases/tag/v0.1.0) bereit.

## Features

- **Ordner auswählen** — Quelle und optional anderes Ziel; Unterordner mit einbeziehen.
- **10 editierbare Sortierregeln** — `.png`, `.jpg` usw. nach `Fotos`; eigene Kategorien, Ordner und Endungen ergänzen.
- **Sortiervorschau vor dem Verschieben** — Dateiname, Zielordner und Namenskonflikte.
- **Keine stillen Überschreibungen** — bei gleichen Namen sichere Suffixe wie `Bild (2).png`.
- **Duplikatsuche mit SHA-256** — Dateien anhand des Inhalts statt allein anhand des Namens vergleichen.
- **Manuelle Entscheidung über Duplikate** — Empfehlungen anzeigen, einzeln auswählen und nur nach Bestätigung in den Windows-Papierkorb verschieben. Mindestens eine Kopie je Gruppe bleibt erhalten.
- **Undo-Verlauf** — zuletzt sortierte Dateien zurückverschieben, solange die ursprünglichen Speicherorte frei sind.
- **CSV-Export**, Dark/Light-Modus und rein lokale Einstellungen.
- **Sicherheitsbewusst** — Context Isolation, Sandboxing, deaktivierte Node-Integration im Renderer, keine externen APIs.

## Schnellstart auf Windows

1. **Node.js 22 LTS** von https://nodejs.org/ installieren.
2. Repository herunterladen oder klonen.
3. Im Projektordner die folgenden Befehle ausführen:

```powershell
npm install
npm start
```

Für Windows-Installer und portable EXE:

```powershell
npm run dist:win
```

Der fertige Installer und die portable Anwendung landen dann in `dist/`.

### Automatisch auf `lavender1510` veröffentlichen

Nach Installation von **Git**, **GitHub CLI (`gh`)** und **Node.js 22** und Anmeldung bei GitHub genügt ein Doppelklick auf **`publish-windows.bat`**. Das Skript prüft, dass das aktive GitHub-Konto `lavender1510` ist, führt die Node-Tests aus, legt das öffentliche Repository `lavender1510/Foldria` an (falls es noch nicht existiert), pusht `main` und danach den Release-Tag `v0.1.0`. Der GitHub-Actions-Workflow erzeugt daraus unter Windows den Installer und die portable EXE und hängt sie nach erfolgreichem Build an den [Release](https://github.com/lavender1510/Foldria/releases).

**Wichtig:** Bestehende Branches und Tags werden dabei *nicht* überschrieben. Der Vorgang benötigt eine GitHub-CLI-Anmeldung mit Erlaubnis, Repositories zu erstellen und Workflows auszuführen. Weitere Details: [BUILD-WINDOWS.md](BUILD-WINDOWS.md).

## Verwendung

1. Quellordner wählen. Optional eigenen Zielbasisordner bestimmen.
2. Unter „Sortierregeln“ die Standardregeln anpassen, deaktivieren oder neue anlegen.
3. „Vorschau erstellen“ klicken — es werden noch keine Dateien verändert.
4. Geplante Änderungen kontrollieren und dann „Jetzt sortieren“.
5. Unter „Duplikate“ im Quellordner (inklusive Unterordner) den Inhaltsvergleich starten; empfohlene Kopien **bewusst auswählen** und ggf. in den Papierkorb verschieben.
6. Im „Verlauf“ eine Sortierung bei Bedarf zurücknehmen.

## Standardordner

| Ziel | Einige Endungen |
|---|---|
| Fotos | png, jpg, jpeg, webp, gif, svg, heic … |
| Videos | mp4, mov, mkv, avi … |
| Dokumente | pdf, docx, txt, epub … |
| Musik | mp3, wav, flac, m4a … |
| Archive | zip, rar, 7z, iso … |
| Code | js, ts, py, cs, cpp, html … |
| Tabellen | xlsx, csv, ods … |
| Präsentationen | pptx, odp, key … |
| Schriftarten | ttf, otf, woff2 … |
| Programme | exe, msi, apk, deb … |

## Sicherheit und Grenzen

- Alle Scan-Operationen ignorieren symbolische Links und Windows-Junctions; 40.000 Dateien pro Scan maximal.
- Dateiumlagerung erfolgt über exklusives Kopieren, Größen-/Änderungszeitprüfung und erst danach Entfernen der Quelle. Das ist sicher, aber große Dateien können länger benötigen.
- Der Sortiervorgang verschiebt Dateien; er löscht keine Duplikate automatisch. Kein Netzwerkzugriff und kein Cloud-Upload.
- Die Vorschau erkennt Namenskonflikte. Wenn sich währenddessen Dateien ändern oder neu hinzukommen, wird die betroffene Operation übersprungen statt überschrieben.
- Das Undo stellt Dateien nicht wieder her, die seitdem manuell geändert/verschoben oder aus dem Papierkorb gelöscht wurden.
- Die Duplikat-Empfehlung „älteste Datei behalten“ ist eine **Heuristik**. Bitte vor dem Entfernen selbst überprüfen.
- Eine Signierung per Code-Signing-Zertifikat ist **nicht** konfiguriert. Windows SmartScreen kann bei unsignierten Builds warnen.
- Hinweis: Für Dateien auf Netzlaufwerken gelten zusätzliche Dateisystem- und Papierkorb-Einschränkungen.

## Entwicklung und Qualität

```powershell
npm test
npm start
```

`src/core` ist unabhängig von Electron mit Node-Testfällen prüfbar. Ein GitHub-Actions-Workflow baut unter Windows Installer und portable EXE; ein Release wird nur durch das Pushen eines Tags `v*` ausgelöst. Der Workflow ist eingerichtet. Windows-Build, acht Tests und die Veröffentlichung von `v0.1.0` wurden in GitHub Actions erfolgreich durchgeführt. Für weitere Veröffentlichungen kann ein neuer `v*`-Tag gepusht werden.

## Lizenz

[MIT](LICENSE)
