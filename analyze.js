// Vercel Serverless Function (Node.js Runtime)
// Ruft die Anthropic API serverseitig auf, damit der API-Key nie im Browser landet.
// Benötigt die Umgebungsvariable ANTHROPIC_API_KEY im Vercel-Projekt (Settings → Environment Variables).

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-5';
const MAX_PROMPT_CHARS = 200000; // grobe Obergrenze gegen Missbrauch/versehentlich riesige Uploads

function stripJsonFences(raw) {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server ist nicht konfiguriert: ANTHROPIC_API_KEY fehlt.' });
    return;
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Feld "prompt" fehlt oder ist ungültig.' });
    return;
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    res.status(413).json({ error: 'Anfrage zu groß. Bitte Literatur in kleineren Teilen hochladen.' });
    return;
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const raw = textBlock?.text || '';
    const cleaned = stripJsonFences(raw);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON-Parse-Fehler:', parseErr, cleaned.slice(0, 500));
      res.status(502).json({ error: 'Antwort des Modells konnte nicht als JSON gelesen werden.' });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('Anthropic API Fehler:', err);
    res.status(502).json({ error: 'Fehler bei der Analyse. Bitte erneut versuchen.' });
  }
};
