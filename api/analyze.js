export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt fehlt" });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || "API-Fehler" });

    const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    const clean = text.replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (e) {
    return res.status(500).json({ error: "Antwort konnte nicht verarbeitet werden" });
  }
}
