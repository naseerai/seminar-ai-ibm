/**
 * Local proxy server for Agentic AI Seminar Script Generator
 * Forwards browser requests to IBM IAM + watsonx.ai, bypassing CORS.
 * Also routes /api/agent to the local agent.js serverless handler.
 *
 * Usage:
 *   node server.js
 *   Then open http://localhost:3000 in your browser.
 *
 * Requires Node.js 18+ (uses built-in fetch).
 * No npm install needed.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;

const IBM_IAM_URL = "https://iam.cloud.ibm.com/identity/token";
const IBM_WX_URL = "https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2024-05-31";

// ── Body reader ──
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ── Simple proxy (for /api/iam and /api/watsonx) ──
async function proxyRequest(targetUrl, req, res) {
  const body = await readBody(req);
  const headers = {};
  if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];
  if (req.headers["authorization"]) headers["Authorization"] = req.headers["authorization"];

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === "POST" ? body : undefined,
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(text);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "proxy_error", message: err.message }));
  }
}

// ── Serverless-style handler adapter ──
// Makes the Vercel-style handlers (req.status().json()) work with raw Node http
function adaptResponse(res) {
  let statusCode = 200;
  const adapter = {
    status(code) { statusCode = code; return adapter; },
    setHeader(k, v) { res.setHeader(k, v); return adapter; },
    json(obj) { adapter.end(JSON.stringify(obj)); },
    end(body) {
      if (!res.headersSent) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.writeHead(statusCode);
      }
      res.end(body || "");
    },
  };
  return adapter;
}

// ── Load serverless handlers ──
const agentHandler = require("./api/agent");
const iamHandler = require("./api/iam");
const watsonxHandler = require("./api/watsonx");

// ── HTTP Server ──
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  const url = req.url.split("?")[0];

  // Route to serverless handlers
  if (url === "/api/agent" && req.method === "POST") return agentHandler(req, adaptResponse(res));
  if (url === "/api/iam" && req.method === "POST") return iamHandler(req, adaptResponse(res));
  if (url === "/api/watsonx" && req.method === "POST") return watsonxHandler(req, adaptResponse(res));

  // Serve static files
  let filePath = url === "/" ? "/index.html" : url;
  filePath = path.join(__dirname, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(filePath);
    const mime = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(data);
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} already in use.\n`);
  } else {
    console.error("\n❌  Server error:", err.message);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n✅  Agentic AI Seminar Script Generator`);
  console.log(`   Running at → http://localhost:${PORT}\n`);
  console.log(`   Routes:`);
  console.log(`   • GET  /           → index.html`);
  console.log(`   • POST /api/iam    → IBM IAM token`);
  console.log(`   • POST /api/watsonx→ watsonx.ai generation`);
  console.log(`   • POST /api/agent  → Agentic pipeline (Plan→Draft→Critique→Refine)\n`);
});
