// Vercel Serverless Function (CommonJS, läuft ohne "type": "module")
const MODELS = {
  fast: process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5-20251001",
  precise: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
};
const MAX_PROMPT_CHARS = 120000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;
const requestLog = new Map();

function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(forwarded || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim().slice(0, 128) || 'unknown';
}

function allowRequest(req) {
  const now = Date.now();
  const key = getClientKey(req);
  const recent = (requestLog.get(key) || []).filter(timestamp => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return false;
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 1000) {
    for (const [entryKey, timestamps] of requestLog) {
      if (!timestamps.some(timestamp => now - timestamp < WINDOW_MS)) requestLog.delete(entryKey);
    }
  }
  return true;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  return host && new URL(origin).host === host;
}

// Extrahiert das erste vollständige JSON-Objekt, auch wenn Text/Fences drumherum stehen.
function extractJson(raw) {
  const text = String(raw || "").replace(/```json|```/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("kein JSON gefunden");
  return JSON.parse(text.slice(start, end + 1));
}

async function callAnthropic(prompt, model) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Ungültige Anfragequelle." });
  if (!allowRequest(req)) return res.status(429).json({ error: "Zu viele Anfragen. Bitte warten Sie eine Minute." });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server nicht konfiguriert: ANTHROPIC_API_KEY fehlt in den Vercel-Umgebungsvariablen." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { prompt, mode } = body || {};
  const model = MODELS[mode] || MODELS.fast;
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "prompt fehlt" });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(413).json({ error: "Anfrage zu groß." });

  let lastErr = "unbekannter Fehler";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { r, data } = await callAnthropic(prompt, model);
      if (!r.ok) {
        lastErr = `Anthropic-API ${r.status}: ${data.error?.message || "Fehler"}`;
        // Nur bei Überlast/Rate-Limit erneut versuchen
        if ([429, 500, 529].includes(r.status)) { await new Promise(r => setTimeout(r, 1500)); continue; }
        return res.status(502).json({ error: lastErr });
      }
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      try {
        return res.status(200).json(extractJson(text));
      } catch (parseErr) {
        lastErr = `Modell-Antwort nicht als JSON lesbar (${parseErr.message}${data.stop_reason === "max_tokens" ? ", Antwort abgeschnitten" : ""})`;
        console.error(lastErr, text.slice(0, 300));
      }
    } catch (e) {
      lastErr = `Netzwerkfehler: ${e.message}`;
      console.error(e);
    }
  }
  return res.status(502).json({ error: lastErr });
};
