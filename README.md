# beleg-improved

Ein Tool zur Unterstützung wissenschaftlichen Schreibens an der Universität Frankfurt am Main zur Vermeidung von Patchwriting.

## Architektur

- `index.html` — komplette Frontend-Anwendung (kein Build-Schritt nötig)
- `api/analyze.js` — Vercel Serverless Function, ruft die Anthropic API **serverseitig** auf

Die Analyse läuft **nicht mehr** über `window.claude` (das nur innerhalb von
Claude-Web-Anwendungen verfügbar ist), sondern über eine Serverless Function.

## Setup

1. Klonen Sie dieses Repository.
2. In den Vercel-Projekteinstellungen (`Project Settings` → `Environment Variables`)
   eine Environment Variable `ANTHROPIC_API_KEY` mit einem gültigen Anthropic-API-Key anlegen
   (für Production, Preview und Development).
3. Deployen — Vercel erkennt `api/analyze.js` automatisch als Serverless Function.
4. `npm install` läuft automatisch (Abhängigkeit: `@anthropic-ai/sdk`).

Lokal testen: `vercel dev` (benötigt die Vercel CLI und eine lokale `.env`
mit `ANTHROPIC_API_KEY=...`).

## Benutzung

1. Exposé hochladen (PDF oder einfügen).
2. Literatur(en) hochladen/einfügen.
3. Analysieren — das Tool liefert Zitate und Paraphrasen mit Harvard-Zitierweise.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
