# beleg-improved

> A web-based assistant for academic writing at Goethe University Frankfurt – specifically designed to prevent **patchwriting**, improper paraphrasing, and unintentional plagiarism.

[![Live Demo](https://img.shields.io/badge/Demo-beleg--improved.vercel.app-0070f3?style=flat-square&logo=vercel)](https://beleg-improved.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Vercel Serverless](https://img.shields.io/badge/Vercel-Serverless%20Functions-black?style=flat-square&logo=vercel)](https://vercel.com)
[![Anthropic Claude](https://img.shields.io/badge/AI-Anthropic%20Claude%20SDK-6B4FBB?style=flat-square)](https://docs.anthropic.com)

---

## 📖 About the Project

In academic writing, **patchwriting** (merely replacing isolated words or restructuring sentences from source materials without genuine intellectual synthesis) is a pervasive source of error and potential plagiarism.

**beleg-improved** supports students and researchers in cross-referencing their drafts (e.g., research proposals, exposés, or manuscripts) against relevant scholarly literature. It identifies textual overlaps, generates standard-compliant academic citations (including **Harvard style**), and guides writers toward substantial, academically sound paraphrasing.

### ✨ Key Features

- 📄 **Multi-Format Input:** Upload draft exposés as PDFs or paste plain text directly into the editor.
- 📚 **Literature Management:** Upload and manage multiple reference documents and source texts concurrently.
- 🔍 **AI-Powered Deep Analysis:** Automated comparison of drafts against source texts via the Anthropic Claude API.
- ✍️ **Paraphrase & Citation Assistant:** Concrete suggestions for standard-compliant citations (Harvard reference format) and authentic paraphrasing.
- 🛠️ **Workshop Mode:** Interactive revision environment (`werkstatt.html` & matrix view) for side-by-side text refinement.

---

## 🏛️ Architecture & Tech Stack

The application is lightweight, performant, and deliberately avoids complex build pipelines:

```text
beleg-improved/
├── api/
│   └── analyze.js       # Vercel Serverless Function (Anthropic SDK integration)
├── images/              # Assets & UI screen designs
├── index.html           # Main application interface
├── werkstatt.html       # Writing & revision workshop
├── matrix.js            # Comparison & matrix analysis logic
├── matrix-addon.js      # Advanced matrix visualizer addons
├── app.js               # Frontend application state & event handling
├── styles.css           # Core styling
├── landing.css          # Landing page & hero layouts
├── vercel.json          # Deployment & routing configuration
└── package.json         # Serverless dependencies (@anthropic-ai/sdk)
```

- **Frontend:** Pure HTML5, modern CSS3, and Vanilla JavaScript (zero bundlers — no Webpack or Vite required).
- **Backend / API:** Vercel Serverless Function (`api/analyze.js`), handling requests securely server-side via `@anthropic-ai/sdk` without exposing API keys to client browsers.

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- A valid [Anthropic Claude API Key](https://console.anthropic.com/)
- Optional: [Vercel CLI](https://vercel.com/cli) (`npm i -g vercel`)

### 1. Clone & install dependencies
```bash
git clone https://github.com/avis097/beleg-improved.git
cd beleg-improved
npm install
```

### 2. Configure local environment variables
Create a `.env` file in the root directory:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. Run locally with Vercel CLI
```bash
vercel dev
```
The application will be accessible at `http://localhost:3000`.

---

## ☁️ Deployment on Vercel

1. Import the repository into [Vercel](https://vercel.com).
2. Under **Project Settings** ➔ **Environment Variables**, add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...`
   - Environments: *Production*, *Preview*, *Development*
3. Trigger deployment — Vercel automatically detects the static assets and the serverless route at `api/analyze.js`.

---

## 📝 Academic Context

Developed for academic applications and university research support at **Goethe University Frankfurt am Main**.

> *"Patchwriting is restating a phrase, clause, or one or two sentences in a paragraph with slightly different language from the source."*  
> This tool fosters authentic academic voice, source transparency, and rigorous citation integrity.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

