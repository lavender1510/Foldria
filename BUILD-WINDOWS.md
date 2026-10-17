# Foldria v0.1.0 – Windows bauen und auf GitHub veröffentlichen

## Voraussetzungen

- Windows 10 oder 11 (64-Bit) mit **Node.js 22** (https://nodejs.org/)
- **Git for Windows** (https://git-scm.com/download/win)
- **GitHub CLI** (https://cli.github.com/)
- GitHub-Konto `lavender1510` mit Berechtigung, öffentliche Repositories anzulegen.

## Einmaliger Release: einfacher Weg

1. ZIP herunterladen, entpacken und den Ordner **Foldria** öffnen.
2. `publish-windows.bat` doppelklicken.
3. Wenn GitHub CLI eine Anmeldung verlangt, im Browser mit **lavender1510** anmelden.
4. Das Skript prüft die Kernfunktionstests, erstellt ggf. das neue GitHub-Repository, pusht den Quellcode und den Tag `v0.1.0`.
5. Den Build-Status unter https://github.com/lavender1510/Foldria/actions beobachten.
6. Wenn der Workflow erfolgreich abgeschlossen wurde, stehen **Foldria-Setup-0.1.0-x64.exe**, **Foldria-Portable-0.1.0-x64.exe** und **SHA256SUMS.txt** unter https://github.com/lavender1510/Foldria/releases zum Download.

Das Skript überschreibt bewusst **keinen bestehenden `main`-Branch oder Versionstag**. Wenn schon ein Repository mit Inhalt existiert, bricht es ab.

## Lokal testen und Windows-Dateien erzeugen

Im Ordner `Foldria`:

```powershell
npm install
npm test
npm run dist:win
```

Danach liegen die beiden EXE-Dateien im Verzeichnis `dist/`. Für erste Tests lässt sich die App mit `npm start` öffnen.

## Manuell veröffentlichen (Alternative)

```powershell
gh auth login
gh auth status
git init -b main
git add .
git commit -m "feat: initial Foldria desktop application"
gh repo create lavender1510/Foldria --public --description "Foldria - moderner Windows-Datei-Sortierer"
git remote add origin https://github.com/lavender1510/Foldria.git
git push -u origin main
git tag -a v0.1.0 -m "Foldria v0.1.0"
git push origin v0.1.0
```

**Bitte keine bestehenden Branches/Tags ungeprüft ersetzen.** Bei vorhandenen Repositories stattdessen bestehende Geschichte prüfen und regulär zusammenführen.

## Release-Automation

`.github/workflows/release.yml` startet auf einem Windows-Runner bei `v*`-Tags oder manuellem Workflow-Start. Es installiert Dependencies, führt Tests aus, erstellt NSIS-Installer und portable EXE, erzeugt SHA-256-Prüfsummen und veröffentlicht die Dateien bei Tag-Auslösung in einem GitHub Release.

## Hinweise

- Eine digitale Signatur ist nicht eingerichtet. Windows SmartScreen kann deshalb warnen.
- Wenn ein Build fehlschlägt, im Actions-Reiter den fehlgeschlagenen Schritt öffnen und die Logs lesen.
- Vor der Sortierung wichtiger Daten ein Backup anlegen. Die erste Version ist ein Prototyp.
- Das Installationspaket lässt sich nicht erzeugen, solange Electron und electron-builder nicht heruntergeladen werden können; der GitHub Windows-Runner übernimmt diesen Download normalerweise automatisch.
