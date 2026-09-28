pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const CHUNK_CHARS = 14000; // pro Analyse-Abschnitt, damit auch lange Literatur vollständig verarbeitet wird
const OCR_AVG_CHARS_THRESHOLD = 25; // unterhalb dieses Durchschnitts pro Seite wird OCR versucht

const expoFile = document.getElementById('expoFile');
const expoBtn = document.getElementById('expoBtn');
const expoStatus = document.getElementById('expoStatus');
const expoText = document.getElementById('expoText');

const litSourcesEl = document.getElementById('litSources');
const addSourceBtn = document.getElementById('addSourceBtn');

const runBtn = document.getElementById('run');
const statusEl = document.getElementById('status');
const errorBox = document.getElementById('errorBox');
const briefBox = document.getElementById('briefBox');
const resultsEl = document.getElementById('results');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');

expoBtn.addEventListener('click', () => expoFile.click());
expoFile.addEventListener('change', async () => {
  const f = expoFile.files[0];
  if (!f) return;
  try { expoText.value = await extractPdf(f, expoStatus); }
  catch (e) { console.error(e); expoStatus.textContent = 'Fehler beim Lesen'; }
});

// ---------- Mehrere Literaturquellen ----------

let sourceCount = 0;

function createSourceCard() {
  sourceCount += 1;
  const num = sourceCount;
  const card = document.createElement('div');
  card.className = 'src-card';
  card.innerHTML = `
    <div class="src-card-head">
      <h3>Literatur ${num}</h3>
      ${num > 1 ? '<button type="button" class="remove-btn" aria-label="Quelle entfernen">Entfernen</button>' : ''}
    </div>
    <p class="src-hint">Fachtext, aus dem zitiert werden soll — wird vollständig verarbeitet</p>
    <div class="file-row">
      <button class="file-btn" type="button">PDF wählen</button>
      <span class="file-status">kein PDF geladen</span>
    </div>
    <input type="file" accept="application/pdf" hidden>
    <textarea placeholder="… oder Text direkt einfügen"></textarea>
  `;
  const fileBtn = card.querySelector('.file-btn');
  const fileInput = card.querySelector('input[type=file]');
  const status = card.querySelector('.file-status');
  const textarea = card.querySelector('textarea');
  const removeBtn = card.querySelector('.remove-btn');

  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try { textarea.value = await extractPdf(f, status); }
    catch (e) { console.error(e); status.textContent = 'Fehler beim Lesen'; }
  });
  if (removeBtn) removeBtn.addEventListener('click', () => card.remove());

  return card;
}

addSourceBtn.addEventListener('click', () => {
  litSourcesEl.appendChild(createSourceCard());
});

// Immer mit einer Literaturquelle starten
litSourcesEl.appendChild(createSourceCard());

// ---------- PDF-Extraktion inkl. OCR-Fallback ----------

const OCR_WORKERS = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
let ocrWorkersPromise = null;
function getOcrWorkers() {
  if (!ocrWorkersPromise) {
    ocrWorkersPromise = Promise.all(Array.from({ length: OCR_WORKERS }, () => Tesseract.createWorker('deu')));
  }
  return ocrWorkersPromise;
}

async function ocrPage(page, worker) {
  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const { data } = await worker.recognize(canvas);
  return (data.text || '').trim();
}

async function extractPdf(file, statusEl) {
  statusEl.textContent = 'Lese PDF …';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = pdf.numPages;
  const pageTexts = [];
  let totalChars = 0;

  const pageNums = Array.from({ length: pages }, (_, i) => i + 1);
  let read = 0;
  await runPool(pageNums, 8, async (p) => {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map(it => it.str).join(' ').trim();
    pageTexts[p - 1] = { p, page, text };
    totalChars += text.length;
    statusEl.textContent = `Lese Seite ${++read} / ${pages} …`;
  });

  const avgChars = totalChars / pages;
  let usedOcr = false;
  if (avgChars < OCR_AVG_CHARS_THRESHOLD) {
    usedOcr = true;
    const todo = pageTexts.filter(pt => pt.text.length < 10);
    statusEl.textContent = 'Starte Texterkennung (OCR) …';
    const workers = await getOcrWorkers();
    let ocrDone = 0, slot = 0;
    await runPool(todo, workers.length, async (pt) => {
      const w = workers[slot++ % workers.length];
      try { pt.text = await ocrPage(pt.page, w); }
      catch (e) { console.error('OCR-Fehler Seite', pt.p, e); }
      statusEl.textContent = `OCR Seite ${++ocrDone} / ${todo.length} …`;
    });
  }

  const out = pageTexts.map(pt => `\n[Seite ${pt.p}]\n${pt.text}\n`).join('');
  statusEl.textContent = `${pages} Seite(n) geladen${usedOcr ? ' (per OCR)' : ''}`;
  return out.trim();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Text in Abschnitte teilen, ohne Seiten mittendrin zu zerschneiden
function splitIntoChunks(text, maxChars) {
  const pageBlocks = text.split(/(?=\[Seite \d+\])/g).filter(Boolean);
  if (pageBlocks.length === 0) return [text];
  const chunks = [];
  let current = '';
  for (const block of pageBlocks) {
    if (current && (current.length + block.length) > maxChars) {
      chunks.push(current);
      current = block;
    } else {
      current += block;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function renderBrief(briefs) {
  briefBox.innerHTML = briefs.map(b => `
    <div class="brief2">
      ${briefs.length > 1 ? `<div class="src">${escapeHtml(b.sourceLabel)}</div>` : ''}
      <span class="k">Leitfrage</span><span>${escapeHtml(b.leitfrage || '—')}</span>
      <span class="k">Quelle</span><span>${escapeHtml([b.erkannter_autor, b.erkanntes_jahr].filter(Boolean).join(', ') || 'nicht sicher erkannt')}${b.chunkCount > 1 ? ` <span class="map-src">· ${b.chunkCount} Abschnitte analysiert</span>` : ''}</span>
      ${b.quellen_hinweis ? `<p class="warn">${escapeHtml(b.quellen_hinweis)}</p>` : ''}
    </div>
  `).join('');
}

let exposeOutline = [];

function pageOf(e) {
  const m = String(e.direktes_zitat || '').match(/S\.\s*(\d+(?:\s*[–-]\s*\d+)?)/);
  return m ? m[1] : '';
}

// Übersicht: welcher Beleg passt an welche Stelle des Exposés
function buildMapping(entries) {
  if (!entries.some(e => e.expose_stelle)) return '';
  const groups = new Map();
  entries.forEach((e, i) => {
    const k = (e.expose_stelle || 'Ohne Zuordnung').trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ e, i });
  });
  const idx = k => { const j = exposeOutline.findIndex(o => o.trim().toLowerCase() === k.toLowerCase()); return j === -1 ? 999 : j; };
  const keys = [...groups.keys()].sort((a, b) => idx(a) - idx(b));
  return `<section class="mapping"><h2>Zuordnung zum Exposé</h2>` + keys.map(k =>
    `<div class="map-group"><p class="map-stelle">${escapeHtml(k)}</p><ul>` +
    groups.get(k).map(({ e, i }) =>
      `<li><a href="#kern-${i + 1}">Kernaussage ${i + 1}</a>: ${escapeHtml(e.kernargument)} <span class="map-src">(${escapeHtml(e.quelle || '')}${pageOf(e) ? ', S. ' + escapeHtml(pageOf(e)) : ''})</span></li>`
    ).join('') + `</ul></div>`).join('') + `</section>`;
}

let activeFilter = '';
const tabState = {};
const TABS = [
  ['q', 'Direktes Zitat', 'direktes_zitat', true],
  ['i', 'Integrierend', 'indirekt_integrierend', false],
  ['n', 'Nicht-integrierend', 'indirekt_nicht_integrierend', false],
  ['s', 'Zusammenfassung', 'zusammenfassung', false],
];
const stelleOf = e => (e.expose_stelle || '').trim() || 'Ohne Zuordnung';

function applyFilter() {
  resultsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === activeFilter));
  resultsEl.querySelectorAll('.entry').forEach(a => { a.hidden = !!activeFilter && a.dataset.stelle !== activeFilter; });
}

function renderEntries(entries, multiSource) {
  const idx = k => { const j = exposeOutline.findIndex(o => o.trim().toLowerCase() === k.toLowerCase()); return j === -1 ? 999 : j; };
  const keys = [...new Set(entries.map(stelleOf))].sort((a, b) => idx(a) - idx(b));
  if (activeFilter && !keys.includes(activeFilter)) activeFilter = '';
  const nSrc = new Set(entries.map(e => e.quelle)).size;

  const toolbar = `<div class="toolbar"><span class="count">${entries.length} Kernaussage${entries.length === 1 ? '' : 'n'}${multiSource ? ` aus ${nSrc} Quellen` : ''}</span>` +
    (entries.some(e => e.expose_stelle) ? `<div class="chips"><button type="button" class="chip" data-filter="">Alle</button>${keys.map(k => `<button type="button" class="chip" data-filter="${escapeHtml(k)}">${escapeHtml(k)}</button>`).join('')}</div>` : '') +
    `</div>`;

  const cards = entries.map((e, i) => {
    const n = i + 1, active = tabState[n] || 'q';
    const tabs = TABS.map(([id, label]) => `<button type="button" class="tab${id === active ? ' active' : ''}" role="tab" aria-selected="${id === active}" data-tab="${id}">${label}</button>`).join('');
    const panels = TABS.map(([id, , key, isQ]) => {
      const fid = `f${n}${id}`;
      return `<div class="panel" data-panel="${id}" role="tabpanel"${id === active ? '' : ' hidden'}>
        <p class="field-text${isQ ? ' quote' : ''}" id="${fid}">${escapeHtml(e[key])}</p>
        <div class="field-foot"><button type="button" class="copy-btn" data-target="${fid}">Kopieren</button></div>
      </div>`;
    }).join('');
    return `<article class="entry" id="kern-${n}" data-n="${n}" data-stelle="${escapeHtml(stelleOf(e))}">
      <div class="entry-head">
        <span class="num">#${n}</span>
        ${multiSource ? `<span class="tag">${escapeHtml(e.quelle)}</span>` : ''}
        ${e.expose_stelle ? `<span class="tag stelle-tag">→ ${escapeHtml(e.expose_stelle)}${e.einordnung ? ' · ' + escapeHtml(e.einordnung) : ''}</span>` : ''}
      </div>
      <h2>${escapeHtml(e.kernargument)}</h2>
      ${e.relevanz ? `<p class="relevanz">${escapeHtml(e.relevanz)}</p>` : ''}
      <div class="tabs" role="tablist">${tabs}</div>
      ${panels}
    </article>`;
  }).join('');

  resultsEl.innerHTML = toolbar + buildMapping(entries) + cards;
  applyFilter();
}

// Ein einziger Klick-Handler für Filter, Reiter, Kopieren und Sprunglinks
resultsEl.addEventListener('click', async (ev) => {
  const link = ev.target.closest('a[href^="#kern-"]');
  if (link && activeFilter) { activeFilter = ''; applyFilter(); return; }

  const chip = ev.target.closest('.chip');
  if (chip) { activeFilter = chip.dataset.filter; applyFilter(); return; }

  const tab = ev.target.closest('.tab');
  if (tab) {
    const art = tab.closest('.entry'), id = tab.dataset.tab;
    tabState[art.dataset.n] = id;
    art.querySelectorAll('.tab').forEach(t => { const on = t === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    art.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== id; });
    return;
  }

  const btn = ev.target.closest('.copy-btn');
  if (btn) {
    try {
      await navigator.clipboard.writeText(document.getElementById(btn.dataset.target).textContent);
      btn.textContent = 'Kopiert'; btn.classList.add('done');
      setTimeout(() => { btn.textContent = 'Kopieren'; btn.classList.remove('done'); }, 1600);
    } catch { btn.textContent = 'Fehler'; }
  }
});

function buildPromptFirst(expo, chunk, multiPart) {
  return `Du bist ein wissenschaftlicher Schreibassistent nach den Kriterien des Schreibzentrums der Universität Frankfurt am Main. Du arbeitest mit Harvard-Zitierweise (Kurzbeleg im Text: Nachname Jahr: Seite).

EXPOSÉ (enthält These/Forschungsfrage/Kapitelstruktur der Hausarbeit):
"""
${expo}
"""

LITERATUR${multiPart ? ' (erster Abschnitt eines längeren Textes; Seiten sind mit "[Seite N]" markiert)' : ' (Seiten sind mit "[Seite N]" markiert)'}:
"""
${chunk}
"""

Aufgabe:
1. Fasse die Leitfrage/These des Exposés in einem Satz zusammen (Feld "leitfrage"). Liste außerdem die Gliederungspunkte/Kapitel des Exposés in ihrer Reihenfolge (Feld "gliederung", kurze Bezeichnungen wie im Exposé, z.B. "2.1 Begriffsklärung"); wenn keine Gliederung erkennbar ist: ["These","Forschungsfrage"].
2. Versuche, Nachname des Autors/der Autorin und Erscheinungsjahr aus dem Literaturtext zu erkennen (Titelseite, Kopfzeile, Selbstverweis o.ä.). Wenn unsicher: Felder leer lassen und in "quellen_hinweis" kurz erklären, dass die Angaben manuell zu ergänzen sind.
3. Wähle NUR die Passagen aus diesem Abschnitt aus, die inhaltlich tatsächlich relevant für die Leitfrage des Exposés sind — ignoriere thematisch abseitige Passagen. Wenn nichts relevant ist, gib ein leeres "entries"-Array zurück. Maximal 4 Kernaussagen pro Abschnitt.
4. Erstelle für jede ausgewählte Kernaussage:
- kernargument: Kurzbezeichnung, wofür/für welches Kapitel der Hausarbeit relevant.
- expose_stelle: die Stelle im Exposé, an der dieser Beleg eingesetzt werden sollte — exakt eine Bezeichnung aus "gliederung" (bei fehlender Gliederung: "These" oder "Forschungsfrage").

- einordnung: sehr kurz (max. 8 Wörter), wie der Beleg dort verwendet werden kann (z.B. "stützt die These", "Definition", "Gegenposition", "Beispiel").

- relevanz: ein Satz, warum diese Aussage die These/Leitfrage des Exposés stützt oder für sie relevant ist.
- direktes_zitat: wortgenaue Wiedergabe in Anführungszeichen, am Ende im Harvard-Stil "(Nachname Jahr: S. X)" mit der Seitenzahl aus dem nächstgelegenen [Seite N]-Marker; falls Autor/Jahr unsicher, Platzhalter "([Autor] [Jahr]: S. X)" verwenden.
- indirekt_integrierend: eine sprachlich eigenständige Paraphrase (andere Satzstruktur, nicht nur Synonyme) mit Autor aktiv im Satz, z.B. "Nachname (Jahr) argumentiert, dass …". Verhindere Patchwriting konsequent.
- indirekt_nicht_integrierend: eine weitere, unabhängig formulierte Paraphrase mit Fokus auf dem Fakt, Quelle in Klammern am Satzende im Harvard-Stil, z.B. "… (vgl. Nachname Jahr: S. X)."
- zusammenfassung: ein kurzer Satz zum größeren Zusammenhang dieser Textpassage.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (keine Markdown-Codeblöcke, kein Fließtext davor oder danach) in dieser Form:
{"leitfrage":"...","erkannter_autor":"...","erkanntes_jahr":"...","quellen_hinweis":"...","gliederung":["..."],"entries":[{"kernargument":"...","expose_stelle":"...","einordnung":"...","relevanz":"...","direktes_zitat":"...","indirekt_integrierend":"...","indirekt_nicht_integrierend":"...","zusammenfassung":"..."}]}`;
}

function buildPromptNext(expo, chunk, leitfrage, autor, jahr, gliederung) {
  const gl = Array.isArray(gliederung) && gliederung.length ? gliederung.join(' | ') : '(nicht erkannt) Exposé-Anfang: ' + String(expo).slice(0, 1500);
  return `Du setzt die Analyse eines längeren Literaturtextes fort (weiterer Abschnitt desselben Textes). Arbeite mit Harvard-Zitierweise.

LEITFRAGE DES EXPOSÉS: ${leitfrage}

GLIEDERUNG DES EXPOSÉS: ${gl}
BEKANNTE QUELLENANGABE: ${autor ? autor : '[Autor]'}, ${jahr ? jahr : '[Jahr]'}

WEITERER LITERATURABSCHNITT (Seiten mit "[Seite N]" markiert):
"""
${chunk}
"""

Wähle NUR Passagen aus diesem Abschnitt, die inhaltlich relevant für die obige Leitfrage sind — ignoriere thematisch abseitige Passagen. Wenn nichts relevant ist, gib ein leeres "entries"-Array zurück. Maximal 4 Kernaussagen pro Abschnitt. Erstelle für jede relevante Kernaussage dieselben Felder wie zuvor: kernargument, expose_stelle (exakt eine Bezeichnung aus der GLIEDERUNG), einordnung (max. 8 Wörter), relevanz, direktes_zitat (Harvard-Stil mit Seitenzahl aus [Seite N]), indirekt_integrierend (eigenständige Paraphrase, Autor aktiv im Satz), indirekt_nicht_integrierend (eigenständige Paraphrase, Quelle in Klammern am Satzende), zusammenfassung. Kein Patchwriting — echte, eigenständige Umformulierung.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt: {"entries":[{"kernargument":"...","expose_stelle":"...","einordnung":"...","relevanz":"...","direktes_zitat":"...","indirekt_integrierend":"...","indirekt_nicht_integrierend":"...","zusammenfassung":"..."}]}`;
}

// ---------- Aufruf der eigenen Server-API statt window.claude ----------

async function callAnalyze(prompt, mode) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode: mode || document.getElementById('mode').value }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `API-Fehler (${res.status})`);
  }
  return body;
}

// Lokaler Vorfilter (kostet keine Tokens): Literaturverzeichnisse und (nur im Schnell-Modus)
// Abschnitte ohne Wortbezug zum Exposé werden nicht an die API geschickt.
const stems = t => new Set((String(t).toLowerCase().match(/[a-zäöüß]{8,}/g) || []).map(w => w.slice(0, 6)));
function isBibliography(chunk) {
  const lines = chunk.split('\n').filter(l => l.trim().length > 20);
  if (lines.length < 8) return false;
  const ref = /\((?:19|20)\d\d[a-z]?\)|\b(?:19|20)\d\d[a-z]?\b.*\b(?:S\.|pp\.|Hrsg|In:|Verlag|Press)/;
  return lines.filter(l => ref.test(l)).length / lines.length > 0.5;
}
function makeSkipper(expo, mode) {
  const ex = stems(expo);
  return chunk => {
    if (isBibliography(chunk)) return true;
    if (mode !== 'fast') return false;
    return [...stems(chunk)].filter(x => ex.has(x)).length < 2;
  };
}

// Verarbeitet eine einzelne Literaturquelle vollständig (alle Chunks) und liefert brief + entries zurück
const MAX_PARALLEL = 6; // gleichzeitige API-Aufrufe (Rate-Limit-schonend)

// Einfacher Worker-Pool: führt worker(item, index) mit max. `limit` gleichzeitigen Aufrufen aus
async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

// Verarbeitet eine Literaturquelle: Abschnitt 1 zuerst (liefert Leitfrage/Autor/Jahr),
// alle weiteren Abschnitte danach parallel.
async function processSource(expo, sourceText, sourceLabel, onChunkDone, onPartial) {
  const chunks = splitIntoChunks(sourceText, CHUNK_CHARS);
  const perChunk = new Array(chunks.length).fill(null);
  let brief = null;
  let failedChunks = 0;
  let skipped = 0;
  const skip = makeSkipper(expo, document.getElementById('mode').value);
  let lastError = '';

  const handle = (i, data) => {
    perChunk[i] = (data.entries || []).map(e => ({ ...e, quelle: sourceLabel }));
    if (onPartial) onPartial(brief, perChunk.flat().filter(Boolean), chunks.length);
  };
  const fail = (i, err) => {
    console.error(`Chunk-Fehler (${sourceLabel})`, i, err);
    failedChunks++;
    lastError = err.message || String(err);
  };

  try {
    const data = await callAnalyze(buildPromptFirst(expo, chunks[0], chunks.length > 1));
    brief = data;
    handle(0, data);
  } catch (e) { fail(0, e); }
  onChunkDone();

  const rest = chunks.map((c, i) => i).slice(1);
  await runPool(rest, MAX_PARALLEL, async (i) => {
    if (skip(chunks[i])) { skipped++; onChunkDone(); return; }
    try {
      const data = await callAnalyze(buildPromptNext(
        expo, chunks[i],
        brief?.leitfrage || expo.slice(0, 600),
        brief?.erkannter_autor, brief?.erkanntes_jahr, brief?.gliederung));
      handle(i, data);
    } catch (e) { fail(i, e); }
    onChunkDone();
  });

  const entries = perChunk.flat().filter(Boolean); // Reihenfolge = Seitenreihenfolge
  return { brief, entries, chunkCount: chunks.length, failedChunks, skipped, sourceLabel, lastError };
}

async function run() {
  const expo = expoText.value.trim();
  const sourceCards = Array.from(litSourcesEl.querySelectorAll('.src-card'));
  const sources = sourceCards
    .map((card, i) => ({
      label: card.querySelector('h3').textContent,
      text: card.querySelector('textarea').value.trim(),
    }))
    .filter(s => s.text.length > 0);

  errorBox.innerHTML = ''; briefBox.innerHTML = ''; resultsEl.innerHTML = '';
  activeFilter = ''; Object.keys(tabState).forEach(k => delete tabState[k]);

  if (!expo || sources.length === 0) {
    errorBox.innerHTML = '<div class="error">Bitte Exposé und mindestens eine Literaturquelle hochladen oder einfügen.</div>';
    return;
  }

  runBtn.disabled = true;
  progressWrap.classList.add('on');

  const allBriefs = [];
  let allEntries = [];
  let totalFailed = 0;
  let totalSkipped = 0;
let lastErr = '';

  try {
    const totalChunks = sources.reduce((n, src) => n + splitIntoChunks(src.text, CHUNK_CHARS).length, 0);
    let doneChunks = 0;
    const onChunkDone = () => {
      doneChunks++;
      statusEl.textContent = `Analysiere … ${doneChunks} / ${totalChunks} Abschnitte`;
      progressBar.style.width = Math.round((doneChunks / totalChunks) * 100) + '%';
    };
    statusEl.textContent = `Analysiere … 0 / ${totalChunks} Abschnitte`;

    const partial = sources.map(() => ({ brief: null, entries: [], chunkCount: 0 }));
    const refresh = () => {
      const briefs = partial.map((pt, s) => pt.brief ? { ...pt.brief, sourceLabel: sources[s].label, chunkCount: pt.chunkCount } : null).filter(Boolean);
      const entries = partial.flatMap(pt => pt.entries);
      exposeOutline = briefs.flatMap(b => Array.isArray(b.gliederung) ? b.gliederung : []);
      if (briefs.length) renderBrief(briefs);
      if (entries.length) renderEntries(entries, sources.length > 1);
    };
    const results = await Promise.all(sources.map((src, s) =>
      processSource(expo, src.text, src.label, onChunkDone, (brief, entries, chunkCount) => {
        partial[s] = { brief, entries, chunkCount };
        refresh();
      })));

    results.forEach((result, s) => {
      if (result.brief) {
        allBriefs.push({ ...result.brief, sourceLabel: sources[s].label, chunkCount: result.chunkCount });
      }
      allEntries = allEntries.concat(result.entries);
      totalFailed += result.failedChunks;
      totalSkipped += result.skipped;
      if (result.lastError) lastErr = result.lastError;
    });

    progressBar.style.width = '100%';

    if (allBriefs.length === 0) throw new Error(lastErr || 'no-brief');
    renderBrief(allBriefs);

    if (allEntries.length) {
      renderEntries(allEntries, sources.length > 1);
      statusEl.textContent = `${allEntries.length} relevante Kernaussage(n) aus ${sources.length} Quelle(n) gefunden.${totalSkipped ? ` (${totalSkipped} Abschnitt(e) ohne Bezug übersprungen)` : ''}`;
    } else {
      resultsEl.innerHTML = '<div class="warnbox">Keine relevanten Passagen gefunden — prüfen Sie, ob Exposé und Literatur thematisch zusammenpassen.</div>';
      statusEl.textContent = '';
    }

    if (totalFailed) {
      errorBox.innerHTML = `<div class="warnbox">${totalFailed} Abschnitt(e) konnten nicht analysiert werden und wurden übersprungen. Ergebnis ggf. unvollständig — erneut versuchen empfohlen.${lastErr ? ' Letzter Fehler: ' + escapeHtml(lastErr) : ''}</div>`;
    }
  } catch (err) {
    console.error(err);
    errorBox.innerHTML = `<div class="error">Die Analyse ist fehlgeschlagen. ${err.message === 'no-brief' ? '' : escapeHtml(err.message || '')} Bitte erneut versuchen.</div>`;
    statusEl.textContent = '';
  } finally {
    runBtn.disabled = false;
    setTimeout(() => { progressWrap.classList.remove('on'); progressBar.style.width = '0%'; }, 600);
  }
}

runBtn.addEventListener('click', run);
