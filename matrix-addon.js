(function () {
  // Anpassen, falls sich das Thema der Hausarbeit ändert:
  const EMPIRIE_DEF = 'einen konkreten empirischen Vorgang, ein Ereignis, eine Entwicklung oder einen Fall aus dem türkisch-kurdischen Friedensprozess';

  const box = document.getElementById('matrixBox');
  const runEl = document.getElementById('run');
  let lastEntries = [];
  let lastBriefs = [];
  let busy = false;

  // Ergebnisse der bestehenden Analyse mitschneiden
  const _renderEntries = renderEntries;
  renderEntries = function (entries) { lastEntries = entries || []; ensureButton(); return _renderEntries.apply(this, arguments); };
  const _renderBrief = renderBrief;
  renderBrief = function (briefs) { lastBriefs = briefs || []; return _renderBrief.apply(this, arguments); };
  runEl.addEventListener('click', () => { lastEntries = []; lastBriefs = []; box.innerHTML = ''; });

  const HEAD = ['Hausarbeitskapitel', 'Argument', 'Quelle', 'Seite', 'Direktzitat vorhanden?', 'Paraphrase vorhanden?', 'Empirischer Beleg vorhanden?', 'Status'];
  const ST = { bereit: '🟢 Bereit', ausarbeiten: '🟡 Ausarbeiten', offen: '🔴 Offen' };
  const yn = b => (b ? '✅' : '❌');
  const has = s => { s = String(s || '').trim(); return s.length > 3 && !/^(—|–|-+|n\/a|kein(e|en)?\s+(zitat|paraphrase|direkt))/i.test(s); };
  const PAGE_RE = /S\.\s*(\d+(?:\s*[–-]\s*\d+)?)/;

  function ensureButton() {
    if (box.firstChild) return;
    box.innerHTML = '<div style="margin:1.5rem 0 .75rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">' +
      '<button type="button" class="primary" id="matrixBtn">Schreibmatrix erstellen</button>' +
      '<span class="status" id="matrixStatus"></span></div><div id="matrixOut"></div>';
    box.querySelector('#matrixBtn').addEventListener('click', generate);
  }
  const setStatus = t => { const s = box.querySelector('#matrixStatus'); if (s) s.textContent = t; };

  function getOutline(entries) {
    const o = [...new Set((Array.isArray(exposeOutline) ? exposeOutline : []).map(s => String(s).trim()).filter(Boolean))];
    return o.length ? o : [...new Set(entries.map(e => stelleOf(e)))];
  }
  function canon(k, outline) {
    const i = outline.findIndex(o => o.toLowerCase() === String(k || '').trim().toLowerCase());
    return i === -1 ? { name: String(k || 'Ohne Zuordnung').trim(), idx: 999 } : { name: outline[i], idx: i };
  }
  function quelleOf(e) {
    const b = lastBriefs.find(x => x && x.sourceLabel === e.quelle);
    if (b && b.erkannter_autor) return { text: b.erkannter_autor + (b.erkanntes_jahr ? ' (' + b.erkanntes_jahr + ')' : ''), ok: !!b.erkanntes_jahr };
    return { text: e.quelle || '', ok: false };
  }
  function pageAny(e) {
    const p = pageOf(e);
    if (p) return p;
    for (const f of [e.indirekt_nicht_integrierend, e.indirekt_integrierend]) {
      const m = String(f || '').match(PAGE_RE);
      if (m) return m[1];
    }
    return '';
  }

  function buildPrompt(items, outline, leitfrage) {
    return `Du hilfst bei einer Hausarbeit. Grundlage ist ausschließlich die folgende Zitat-Werkstatt (Belege aus der Literatur).

FORSCHUNGSFRAGE: ${leitfrage}

KAPITEL (feste Gliederung, nicht verändern):
${outline.map(k => '- ' + k).join('\n')}

BELEGE (JSON):
${JSON.stringify(items)}

AUFGABE: Fasse die Belege zu Zeilen einer Schreibmatrix zusammen.
- kapitel: exakt eine Bezeichnung aus der Kapitelliste (die des Belegs; bei zusammengeführten Belegen dieselbe).
- argument: zentrales Argument, kurz und präzise (max. 25 Wörter), so formuliert, dass es direkt Grundlage für einen Absatz sein kann.
- ids: Nummern der Belege, die diese Zeile stützen. Führe nur Belege zusammen, die im selben Kapitel dasselbe Argument stützen. Jeder Beleg gehört genau einer Zeile an.
- empirisch: true nur, wenn der Beleg ${EMPIRIE_DEF} belegt; false bei rein theoretischen/konzeptionellen Aussagen.
- Nutze nur die Belege oben, erfinde nichts. Für die Forschungsfrage relevanteste Belege zuerst.

Antworte ausschließlich mit JSON: {"zeilen":[{"kapitel":"...","argument":"...","ids":[1],"empirisch":false}]}`;
  }

  function buildRows(entries, outline, zeilen) {
    const used = new Set(); const raw = [];
    (Array.isArray(zeilen) ? zeilen : []).forEach(z => {
      const ids = [...new Set((Array.isArray(z && z.ids) ? z.ids : []).map(Number))]
        .filter(n => Number.isInteger(n) && n >= 1 && n <= entries.length && !used.has(n));
      if (!ids.length) return;
      ids.forEach(n => used.add(n));
      raw.push({ kapitel: z.kapitel || stelleOf(entries[ids[0] - 1]), argument: String(z.argument || entries[ids[0] - 1].kernargument || '').trim(), ids, emp: z.empirisch === true });
    });
    entries.forEach((e, i) => { if (!used.has(i + 1)) raw.push({ kapitel: stelleOf(e), argument: String(e.kernargument || '').trim(), ids: [i + 1], emp: false }); });

    const rows = raw.map(r => {
      const es = r.ids.map(n => entries[n - 1]);
      const c = canon(r.kapitel, outline);
      const qs = es.map(quelleOf).filter(q => q.text);
      const quelle = qs.length ? [...new Set(qs.map(q => q.text))].join('; ') : '—';
      const seiten = [...new Set(es.map(pageAny).filter(Boolean))];
      const seite = seiten.length ? seiten.join(', ') : '—';
      const direkt = es.some(e => has(e.direktes_zitat));
      const para = es.some(e => has(e.indirekt_integrierend) || has(e.indirekt_nicht_integrierend));
      const fehlt = [];
      if (!qs.length || qs.some(q => !q.ok)) fehlt.push('Autor/Jahr');
      if (seite === '—') fehlt.push('Seitenzahl');
      if (!direkt && !para) fehlt.push('Zitatform');
      if (!r.argument) fehlt.push('Argument');
      return { kapitel: c.name, idx: c.idx, argument: r.argument, quelle, seite, direkt, para, emp: r.emp, status: fehlt.length ? 'ausarbeiten' : 'bereit', fehlt };
    });
    outline.forEach((k, i) => {
      if (!rows.some(r => r.idx === i)) rows.push({ kapitel: k, idx: i, argument: '— (kein ausreichender Beleg in der Zitat-Werkstatt)', quelle: '—', seite: '—', direkt: false, para: false, emp: false, status: 'offen', fehlt: [] });
    });
    rows.sort((a, b) => a.idx - b.idx);
    return rows;
  }

  function priorities(rows) {
    const chapters = [...new Set(rows.map(r => r.kapitel))];
    const of = k => rows.filter(r => r.kapitel === k);
    const lines = [];
    const offen = chapters.filter(k => of(k).every(r => r.status === 'offen'));
    if (offen.length) lines.push('🔴 Kein Beleg vorhanden: ' + offen.join('; '));
    const aus = chapters.map(k => {
      const rs = of(k).filter(r => r.status === 'ausarbeiten');
      return rs.length ? `${k} (${rs.length} von ${of(k).length} Belegen; fehlt: ${[...new Set(rs.flatMap(r => r.fehlt))].join(', ')})` : null;
    }).filter(Boolean);
    if (aus.length) lines.push('🟡 Ausarbeiten: ' + aus.join('; '));
    const duenn = chapters.filter(k => of(k).filter(r => r.status !== 'offen').length === 1);
    if (duenn.length) lines.push('Nur ein Beleg: ' + duenn.join('; '));
    const ohneEmp = chapters.filter(k => { const rs = of(k).filter(r => r.status !== 'offen'); return rs.length && !rs.some(r => r.emp); });
    if (ohneEmp.length) lines.push('Noch ohne empirischen Beleg: ' + ohneEmp.join('; '));
    if (!lines.length) lines.push('🟢 Alle Kapitel sind belegt und bereit.');
    return lines;
  }

  const cellsOf = r => [r.kapitel, r.argument, r.quelle, r.seite, yn(r.direkt), yn(r.para), yn(r.emp), ST[r.status]];
  const TD = 'style="border:1px solid #999;padding:6px 8px;vertical-align:top;text-align:left"';
  function tableHtml(rows) {
    return '<table style="border-collapse:collapse;width:100%;font-size:.9em"><thead><tr>' +
      HEAD.map(h => `<th ${TD}>${escapeHtml(h)}</th>`).join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr>' + cellsOf(r).map(c => `<td ${TD}>${escapeHtml(String(c))}</td>`).join('') + '</tr>').join('') +
      '</tbody></table>';
  }

  function render(rows) {
    const prio = priorities(rows);
    const prioHtml = '<h3>Arbeitsprioritäten</h3><ul>' + prio.map(l => `<li>${escapeHtml(l)}</li>`).join('') + '</ul>';
    const html = tableHtml(rows) + prioHtml;
    const clean = s => String(s).replace(/[\t\r\n]+/g, ' ');
    const text = [HEAD.join('\t'), ...rows.map(r => cellsOf(r).map(clean).join('\t'))].join('\n') + '\n\nArbeitsprioritäten\n' + prio.map(l => '- ' + l).join('\n');
    const out = box.querySelector('#matrixOut');
    out.innerHTML = `<div style="overflow-x:auto">${html}</div><div style="margin-top:.75rem"><button type="button" class="file-btn" id="matrixCopy">Für Google Docs kopieren</button></div>`;
    const cb = out.querySelector('#matrixCopy');
    cb.addEventListener('click', async () => {
      try {
        if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
        else await navigator.clipboard.writeText(text);
        cb.textContent = 'Kopiert ✓';
      } catch (e) { cb.textContent = 'Kopieren fehlgeschlagen'; }
      setTimeout(() => { cb.textContent = 'Für Google Docs kopieren'; }, 2000);
    });
  }

  async function generate() {
    const btn = box.querySelector('#matrixBtn');
    if (runEl.disabled) { setStatus('Die Analyse läuft noch – bitte kurz warten.'); return; }
    if (busy || !lastEntries.length) return;
    busy = true; btn.disabled = true; setStatus('Erstelle Schreibmatrix …');
    try {
      const entries = lastEntries.slice();
      const outline = getOutline(entries);
      const leitfrage = (lastBriefs.find(b => b && b.leitfrage) || {}).leitfrage || '—';
      const items = entries.map((e, i) => ({ id: i + 1, kapitel: stelleOf(e), argument: e.kernargument || '', relevanz: e.relevanz || '', kurz: String(e.zusammenfassung || '').slice(0, 300) }));
      const data = await callAnalyze(buildPrompt(items, outline, leitfrage));
      render(buildRows(entries, outline, data && data.zeilen));
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus('Schreibmatrix fehlgeschlagen: ' + (err.message || 'unbekannter Fehler'));
    } finally { busy = false; btn.disabled = false; }
  }
})();