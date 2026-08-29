import {
  HISTORY_MESSAGES,
  SYSTEM_PROMPT,
  consumeRateLimit,
  findSession,
  jsonResponse,
  optionsResponse,
  recordLatency,
  requireDatabase,
  validateMessage,
} from "./_shared.js";
import { extractText } from "./chat.js";

const MUSE_URL = "https://api.meta.ai/v1/chat/completions";
const MUSE_MODEL = "muse-spark-1.2-contributor";
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function transcribeAudio(ai, buffer) {
  return ai.run(WHISPER_MODEL, {
    audio: toBase64(buffer),
    task: "transcribe",
    language: "te",
    vad_filter: true,
    condition_on_previous_text: false,
    initial_prompt: "తెలంగాణ వ్యవసాయం, పంటలు, వరి, మొక్కజొన్న, పత్తి, మిర్చి, ఎరువులు, తెగుళ్లు",
  });
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
    if (!env.AI) return jsonResponse(request, env, { error: "వాయిస్ సేవ కాన్ఫిగర్ కాలేదు." }, 503);
    if (!env.MUSE_API_KEY) return jsonResponse(request, env, { error: "AI సేవ కాన్ఫిగర్ కాలేదు." }, 503);

    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return jsonResponse(request, env, { error: "వాయిస్ రికార్డింగ్ అందలేదు." }, 400);
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return jsonResponse(request, env, { error: "వాయిస్ రికార్డింగ్ 5 MB లోపు ఉండాలి." }, 413);
    }

    const limit = await consumeRateLimit(db, session.invite_id);
    if (!limit.allowed) return jsonResponse(request, env, {
      error: "గంటకు 30 ప్రశ్నల పైలట్ పరిమితి పూర్తయింది. కొంతసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
      retry_after: limit.retryAfter,
    }, 429, { "Retry-After": String(limit.retryAfter) });

    const transcription = await transcribeAudio(env.AI, await audio.arrayBuffer());
    const transcript = typeof transcription?.text === "string" ? transcription.text.trim() : "";
    const validationError = validateMessage(transcript);
    if (validationError) {
      await recordLatency(db, "/api/agri/voice", startedAt, "whisper", "empty");
      return jsonResponse(request, env, { error: "మాటలు స్పష్టంగా వినిపించలేదు. మళ్లీ ప్రయత్నించండి." }, 422);
    }

    const rows = await db.prepare(
      `SELECT role, content FROM agri_messages
       WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(session.id, HISTORY_MESSAGES).all();
    const history = (rows.results || []).reverse().map((row) => ({ role: row.role, content: row.content }));
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: transcript },
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
      await recordLatency(db, "/api/agri/voice", startedAt, "muse", `upstream_${response.status}`);
      return jsonResponse(request, env, { error: "వాయిస్ ప్రశ్నకు ప్రస్తుతం సమాధానం ఇవ్వలేకపోయాము." }, 502);
    }
    const result = await response.json();
    const answer = extractText(result);
    if (!answer) {
      await recordLatency(db, "/api/agri/voice", startedAt, "muse", "empty");
      return jsonResponse(request, env, { error: "సమాధానం అందలేదు. మళ్లీ ప్రయత్నించండి." }, 502);
    }

    const now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO agri_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)").bind(session.id, "user", transcript, now),
      db.prepare("INSERT INTO agri_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)").bind(session.id, "assistant", answer, now + 1),
      db.prepare("INSERT INTO agri_latency_events (route, provider, latency_ms, status, created_at) VALUES (?, ?, ?, ?, ?)").bind("/api/agri/voice", "whisper+muse", Date.now() - startedAt, "ok", Date.now()),
    ]);
    return jsonResponse(request, env, { transcript, text: answer, provider: "whisper+muse", latency_ms: Date.now() - startedAt });
  } catch (error) {
    if (db) {
      try { await recordLatency(db, "/api/agri/voice", startedAt, "whisper+muse", error?.name === "AbortError" ? "timeout" : "error"); } catch {}
    }
    return jsonResponse(request, env, { error: "వాయిస్ సేవ తాత్కాలికంగా అందుబాటులో లేదు." }, 503);
  }
}
