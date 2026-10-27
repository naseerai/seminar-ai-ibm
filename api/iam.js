// Vercel serverless function — proxies IBM IAM token requests to avoid browser CORS.
export default async function handler(req, res) {
  // Allow CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // req.body is already parsed by Vercel when Content-Type is application/x-www-form-urlencoded
    // Re-encode it for the upstream call
    let body;
    if (typeof req.body === "object" && req.body !== null) {
      body = new URLSearchParams(req.body).toString();
    } else {
      body = req.body || "";
    }

    const upstream = await fetch("https://iam.cloud.ibm.com/identity/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const text = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", "application/json").end(text);
  } catch (err) {
    res.status(502).json({ error: "proxy_error", message: err.message });
  }
}
