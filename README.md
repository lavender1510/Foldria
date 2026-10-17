# Foldria

> Weniger Chaos. Mehr Überblick.

Foldria is a local-first Windows file organizer built with Electron. It offers customizable file-type rules, safe sorting previews, collision protection, SHA-256 duplicate detection, manual duplicate cleanup, and undo history.

## Status

The Windows application source, tests, and release workflow are being prepared for this repository. Builds require Windows and are produced with electron-builder (NSIS installer and portable executable).

## Planned downloads

- `Foldria-Setup-0.1.0-x64.exe`
- `Foldria-Portable-0.1.0-x64.exe`

These are available only after the [release workflow](../../actions) passes. Windows builds may trigger a SmartScreen warning if unsigned.

## Safety

Test sorting using copies of files first. Duplicate deletion always needs explicit confirmation.

## License

MIT
