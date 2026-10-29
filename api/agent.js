// api/agent.js — Vercel serverless function
// Multi-step agentic pipeline: Plan → Draft → Critique → Refine

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

  const rawBody = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  let payload;
  try { payload = JSON.parse(rawBody); } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { step, topic, plan, draft, critique, settings, project_id } = payload;
  const MODEL_ID = "meta-llama/llama-3-3-70b-instruct";
  const WX_URL   = "https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2024-05-31";

  const tone     = settings?.tone     || "Professional";
  const duration = settings?.duration || "1 min";
  const audience = settings?.audience || "General Public";

  let systemPrompt, userMsg, maxTokens;

  if (step === "plan") {
    maxTokens = 250;
    systemPrompt = `You are an expert speech coach and structural planner. When given a seminar topic and delivery settings, create a concise structural plan for the script. Output ONLY 4-5 bullet points covering: the opening hook, 2-3 key content points, and a memorable closing. No script text, no intro sentences — just the bullet plan.`;
    userMsg = `Create a speech structure plan for:\nTopic: "${topic}"\nTone: ${tone}\nDuration: ${duration}\nAudience: ${audience}`;
  } else if (step === "draft") {
    maxTokens = 700;
    systemPrompt = `You are a professional seminar speech writer. Write a polished, engaging seminar script following the provided structural plan exactly. Write in first-person, as if the speaker delivers it live. Output ONLY the script text — no headings, no labels, no commentary.`;
    userMsg = `Structural Plan:\n${plan}\n\nNow write a ${duration} seminar script on "${topic}" for a ${audience} audience in a ${tone} tone.`;
  } else if (step === "critique") {
    maxTokens = 250;
    systemPrompt = `You are a sharp, constructive speech critic. Identify exactly 3 specific weaknesses in this script. Be concise and precise. Output ONLY 3 bullet points — no intro, no outro.`;
    userMsg = `Critique this seminar script:\n\n${draft}`;
  } else if (step === "refine") {
    maxTokens = 700;
    systemPrompt = `You are a master speech writer performing a final polish pass. Rewrite the script to address all critique points while preserving its core message and intent. Output ONLY the final refined script — no commentary, no labels.`;
    userMsg = `Original Script:\n${draft}\n\nCritique Points:\n${critique}\n\nRewrite the script addressing every critique point. Output only the final script.`;
  } else {
    return res.status(400).json({ error: "Invalid step. Must be: plan | draft | critique | refine" });
  }

  const input =
    `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${systemPrompt}<|eot_id|>` +
    `<|start_header_id|>user<|end_header_id|>\n${userMsg}<|eot_id|>` +
    `<|start_header_id|>assistant<|end_header_id|>\n`;

  try {
    const upstream = await fetch(WX_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({
        model_id:   MODEL_ID,
        project_id: project_id,
        input,
        parameters: {
          decoding_method:    "greedy",
          max_new_tokens:     maxTokens,
          min_new_tokens:     20,
          stop_sequences:     ["<|eot_id|>", "<|end_of_text|>"],
          repetition_penalty: 1.1,
        },
      }),
    });

    const text = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", "application/json").end(text);
  } catch (err) {
    res.status(502).json({ error: "proxy_error", message: err.message });
  }
};
