# Zitat-Werkstatt

Ein Browser-Tool, das aus einem Exposé und einer oder mehreren wissenschaftlichen
Literaturquellen (PDF) automatisch die für die Hausarbeit relevanten
Kernaussagen extrahiert — inklusive direktem Zitat, zwei eigenständigen
Paraphrasen (integrierend / nicht-integrierend) und Kurzbeleg im
Harvard-Stil (`Nachname Jahr: Seite`).

Entwickelt nach den Kriterien des Schreibzentrums der Goethe-Universität
Frankfurt am Main zur Vermeidung von Patchwriting.

## Funktionen

- PDF-Upload für Exposé und **mehrere** Literaturquellen (Texterkennung via [pdf.js](https://mozilla.github.io/pdf.js/))
- **OCR-Fallback**: Enthält ein PDF keinen eingebetteten Text (z.B. Scan), wird die Seite automatisch per [Tesseract.js](https://tesseract.projectnaptha.com/) texterkannt (Sprache: Deutsch)
- Vollständige Verarbeitung auch langer Literaturtexte durch seitensicheres Chunking
- Automatische Relevanzprüfung: Nur Passagen, die zur Leitfrage des Exposés passen, werden ausgegeben
- Versuch der automatischen Autor-/Jahr-Erkennung aus dem PDF
- Direktes Zitat, integrierende und nicht-integrierende Paraphrase, Zusammenfassung — je Kernaussage mit Copy-Button
- Harvard-Zitierweise im Text
- Bei mehreren Quellen: Kernaussagen sind mit ihrer Herkunftsquelle markiert

## Architektur

- `index.html` — komplette Frontend-Anwendung (kein Build-Schritt nötig)
- `api/analyze.js` — Vercel Serverless Function, ruft die Anthropic API **serverseitig** auf

Die Analyse läuft **nicht mehr** über `window.claude` (das nur innerhalb von
Claude.ai-Artifacts existiert), sondern über einen eigenen API-Endpunkt
(`POST /api/analyze`), der auf Vercel als Serverless Function läuft und den
Anthropic-API-Key serverseitig verwendet.

## Einrichtung / Deployment

1. Repository zu Vercel importieren (oder bestehendes Projekt neu deployen).
2. Im Vercel-Projekt unter **Settings → Environment Variables** die Variable
   `ANTHROPIC_API_KEY` mit einem gültigen Anthropic-API-Key anlegen
   (für Production, Preview und Development).
3. Deployen — Vercel erkennt `api/analyze.js` automatisch als Serverless Function.
4. `npm install` läuft automatisch (Abhängigkeit: `@anthropic-ai/sdk`).

Lokal testen: `vercel dev` (benötigt die Vercel CLI und eine lokale `.env`
mit `ANTHROPIC_API_KEY=...`).

## Bekannte Einschränkungen

- Kein Layout-bewusstes OCR: bei komplexen Layouts (mehrspaltig, Tabellen) kann die Texterkennung ungenau sein.
- Kurzbeleg, kein vollständiger Literaturverzeichnis-Eintrag.
- Die Modell-Antwort wird als JSON erwartet; bei sehr ungewöhnlichen PDF-Inhalten kann der Parser in Einzelfällen fehlschlagen (wird pro Abschnitt abgefangen und übersprungen).

## Lizenz

MIT, siehe [LICENSE](LICENSE).
