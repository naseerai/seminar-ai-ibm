// api/iam.js — Vercel serverless function
// Proxies IBM IAM token requests server-side to avoid browser CORS restrictions.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Read raw body manually — most reliable across all Vercel runtimes
    const rawBody = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", chunk => { data += chunk; });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });

    const upstream = await fetch("https://iam.cloud.ibm.com/identity/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: rawBody,
    });

    const text = await upstream.text();
    res.status(upstream.status)
       .setHeader("Content-Type", "application/json")
       .end(text);
  } catch (err) {
    res.status(502).json({ error: "proxy_error", message: err.message });
  }
};
