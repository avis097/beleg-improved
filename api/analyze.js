// Vercel Serverless Function (CommonJS, läuft ohne "type": "module")
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_PROMPT_CHARS = 200000;

// Extrahiert das erste vollständige JSON-Objekt, auch wenn Text/Fences drumherum stehen.
function extractJson(raw) {
  const text = String(raw || "").replace(/```json|```/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("kein JSON gefunden");
  return JSON.parse(text.slice(start, end + 1));
}

async function callAnthropic(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server nicht konfiguriert: ANTHROPIC_API_KEY fehlt in den Vercel-Umgebungsvariablen." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { prompt } = body || {};
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "prompt fehlt" });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(413).json({ error: "Anfrage zu groß." });

  let lastErr = "unbekannter Fehler";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { r, data } = await callAnthropic(prompt);
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
