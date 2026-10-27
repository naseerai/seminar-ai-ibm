/**
 * Local proxy server for AI Seminar Script Generator
 * Forwards browser requests to IBM IAM + watsonx.ai, bypassing CORS.
 *
 * Usage:
 *   node server.js
 *   Then open http://localhost:3000 in your browser.
 *
 * Requires Node.js 18+ (uses built-in fetch).
 * No npm install needed.
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT = 3000;

const IBM_IAM_URL = "https://iam.cloud.ibm.com/identity/token";
const IBM_WX_URL  = "https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2024-05-31";

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end",  () => resolve(data));
    req.on("error", reject);
  });
}

async function proxyRequest(targetUrl, req, res) {
  const body    = await readBody(req);
  const headers = {};
  if (req.headers["content-type"])  headers["Content-Type"]  = req.headers["content-type"];
  if (req.headers["authorization"]) headers["Authorization"] = req.headers["authorization"];

  try {
    const upstream = await fetch(targetUrl, {
      method:  req.method,
      headers,
      body:    req.method === "POST" ? body : undefined,
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(text);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "proxy_error", message: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  // Proxy routes
  if (req.url === "/proxy/iam"       && req.method === "POST") return proxyRequest(IBM_IAM_URL, req, res);
  if (req.url === "/proxy/watsonx"   && req.method === "POST") return proxyRequest(IBM_WX_URL,  req, res);

  // Serve index.html and static files
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(__dirname, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext  = path.extname(filePath);
    const mime = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(data);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} is already in use. Try: node server.js\n`);
  } else {
    console.error("\n❌  Server error:", err.message);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n✅  Seminar Script Generator running at http://localhost:${PORT}`);
  console.log(`   Open that URL in your browser.\n`);
});
