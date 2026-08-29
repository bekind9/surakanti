import {
  HISTORY_MESSAGES,
  SYSTEM_PROMPT,
  consumeRateLimit,
  findSession,
  jsonResponse,
  optionsResponse,
  readJson,
  recordLatency,
  requireDatabase,
  validateMessage,
} from "./_shared.js";
import { extractText } from "./chat.js";

const MUSE_URL = "https://api.meta.ai/v1/chat/completions";
const MUSE_MODEL = "muse-spark-1.2-contributor";
const MAX_IMAGE_DATA_CHARS = 2_000_000;

function validImageData(value) {
  return typeof value === "string"
    && value.length <= MAX_IMAGE_DATA_CHARS
    && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return optionsResponse(request, env);
  if (request.method !== "POST") return jsonResponse(request, env, { error: "Method not allowed" }, 405);

  const startedAt = Date.now();
  let db;
  try {
    db = requireDatabase(env);
    const session = await findSession(request, env);
    if (!session) return jsonResponse(request, env, { error: "ముందుగా పైలట్ ఆహ్వాన కోడ్ నమోదు చేయండి." }, 401);

    const body = await readJson(request);
    const message = typeof body?.message === "string" && body.message.trim()
      ? body.message.trim()
      : "ఈ పంట ఫోటోను పరిశీలించి కనిపిస్తున్న సమస్య గురించి చెప్పండి.";
    const validationError = validateMessage(message);
    if (validationError) return jsonResponse(request, env, { error: validationError }, 400);
    if (!validImageData(body?.image)) {
      return jsonResponse(request, env, { error: "చెల్లుబాటు అయ్యే పంట ఫోటోను ఎంచుకోండి." }, 400);
    }

    const limit = await consumeRateLimit(db, session.invite_id);
    if (!limit.allowed) return jsonResponse(request, env, {
      error: "గంటకు 30 ప్రశ్నల పైలట్ పరిమితి పూర్తయింది. కొంతసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
      retry_after: limit.retryAfter,
    }, 429, { "Retry-After": String(limit.retryAfter) });
    if (!env.MUSE_API_KEY) return jsonResponse(request, env, { error: "AI సేవ కాన్ఫిగర్ కాలేదు." }, 503);

    const rows = await db.prepare(
      `SELECT role, content FROM agri_messages
       WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(session.id, HISTORY_MESSAGES).all();
    const history = (rows.results || []).reverse().map((row) => ({ role: row.role, content: row.content }));
    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\nఫోటో ఆధారంగా ఖచ్చితమైన వ్యాధి నిర్ధారణ చేయవద్దు. కనిపించే లక్షణాలను మాత్రమే వివరించి, అవసరమైతే మరింత స్పష్టమైన ఫోటో లేదా వివరాలు అడగండి.` },
      ...history,
      {
        role: "user",
        content: [
          { type: "text", text: message },
          { type: "image_url", image_url: { url: body.image } },
        ],
      },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let response;
    try {
      response = await fetch(MUSE_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.MUSE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MUSE_MODEL,
          messages,
          reasoning_effort: "low",
          temperature: 0.2,
          max_tokens: 1200,
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      await recordLatency(db, "/api/agri/image", startedAt, "muse", `upstream_${response.status}`);
      return jsonResponse(request, env, { error: "ఫోటోను ప్రస్తుతం పరిశీలించలేకపోయాము." }, 502);
    }
    const result = await response.json();
    const answer = extractText(result);
    if (!answer) {
      await recordLatency(db, "/api/agri/image", startedAt, "muse", "empty");
      return jsonResponse(request, env, { error: "ఫోటోపై సమాధానం అందలేదు. మళ్లీ ప్రయత్నించండి." }, 502);
    }

    const now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO agri_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)").bind(session.id, "user", `[పంట ఫోటో] ${message}`, now),
      db.prepare("INSERT INTO agri_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)").bind(session.id, "assistant", answer, now + 1),
      db.prepare("INSERT INTO agri_latency_events (route, provider, latency_ms, status, created_at) VALUES (?, ?, ?, ?, ?)").bind("/api/agri/image", "muse", Date.now() - startedAt, "ok", Date.now()),
    ]);
    return jsonResponse(request, env, { text: answer, provider: "muse", latency_ms: Date.now() - startedAt });
  } catch (error) {
    if (db) {
      try { await recordLatency(db, "/api/agri/image", startedAt, "muse", error?.name === "AbortError" ? "timeout" : "error"); } catch {}
    }
    return jsonResponse(request, env, { error: "ఫోటో సేవ తాత్కాలికంగా అందుబాటులో లేదు." }, 503);
  }
}
