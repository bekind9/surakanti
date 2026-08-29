const DEFAULT_ORIGIN = "https://agri.surakanti.net";
const MAX_MESSAGE_CHARS = 1000;
const HISTORY_MESSAGES = 16; // 8 turns
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export const SYSTEM_PROMPT = `మీరు తెలంగాణ రైతులకు సహాయం చేసే విశ్వసనీయ వ్యవసాయ సహాయకుడు.
తెలుగులో మాత్రమే సమాధానం ఇవ్వండి. సులభమైన, గౌరవప్రదమైన భాష ఉపయోగించండి.
రైతు అడిగిన ప్రశ్నకు నేరుగా, ఆచరణాత్మకంగా సమాధానం ఇవ్వండి.
పంట, నేల, వాతావరణం, తెగుళ్లు, వ్యాధులు, ఎరువులు, సాగు పద్ధతులు మరియు రైతు పథకాలపై మాత్రమే సహాయం చేయండి.
మందుల మోతాదు లేదా వ్యాధి నిర్ధారణ విషయంలో ఖచ్చితంగా చెప్పకుండా, స్థానిక వ్యవసాయ అధికారి లేదా కృషి విజ్ఞాన కేంద్రంతో నిర్ధారించుకోవాలని సూచించండి.
సమాచారం సరిపోకపోతే పంట పేరు, వయస్సు, ప్రాంతం, లక్షణాలు, నీటి పరిస్థితి వంటి వివరాలు అడగండి.
సమాధానం 600 తెలుగు అక్షరాలకు మించకూడదు. ముఖ్యమైన 3 నుంచి 5 సూచనలు మాత్రమే ఇవ్వండి.
మార్క్‌డౌన్ కాకుండా సాధారణ తెలుగు వచనంలో సమాధానం ఇవ్వండి.`;

export function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const configured = env.AGRI_ALLOWED_ORIGIN || DEFAULT_ORIGIN;
  const allowed = new Set([
    configured,
    "https://agri.surakanti.net",
    "http://127.0.0.1:8788",
    "http://localhost:8788",
  ]);
  return origin && allowed.has(origin) ? origin : configured;
}

export function corsHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function jsonResponse(request, env, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
      ...extra,
    },
  });
}

export function optionsResponse(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export async function readJson(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return null;
  }
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionCookie(token) {
  return `agri_session=${encodeURIComponent(token)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookie() {
  return "agri_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax";
}

export function requireDatabase(env) {
  if (!env.DB) throw new Error("D1 binding DB is not configured");
  return env.DB;
}

export async function findSession(request, env) {
  const token = getCookie(request, "agri_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const db = requireDatabase(env);
  return db.prepare(
    `SELECT s.id, s.invite_id, i.code_label
     FROM agri_sessions s
     JOIN agri_invites i ON i.id = s.invite_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND i.active = 1`
  ).bind(tokenHash, Date.now()).first();
}

export async function consumeRateLimit(db, inviteId) {
  const windowStart = Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  await db.prepare(
    `INSERT INTO agri_rate_limits (invite_id, window_start, request_count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(invite_id, window_start)
     DO UPDATE SET request_count = request_count + 1, updated_at = excluded.updated_at`
  ).bind(inviteId, windowStart, Date.now()).run();
  const row = await db.prepare(
    `SELECT request_count FROM agri_rate_limits WHERE invite_id = ? AND window_start = ?`
  ).bind(inviteId, windowStart).first();
  return {
    allowed: Number(row?.request_count || 0) <= RATE_LIMIT,
    count: Number(row?.request_count || 0),
    retryAfter: Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - Date.now()) / 1000)),
  };
}

export async function recordLatency(db, route, startedAt, provider, status) {
  await db.prepare(
    `INSERT INTO agri_latency_events (route, provider, latency_ms, status, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(route, provider, Date.now() - startedAt, status, Date.now()).run();
}

export function validateMessage(value) {
  if (typeof value !== "string") return "ప్రశ్నను తెలుగులో నమోదు చేయండి.";
  const message = value.trim();
  if (!message) return "ప్రశ్నను నమోదు చేయండి.";
  if (message.length > MAX_MESSAGE_CHARS) return `ప్రశ్న ${MAX_MESSAGE_CHARS} అక్షరాలకు మించకూడదు.`;
  return null;
}

export { HISTORY_MESSAGES, MAX_MESSAGE_CHARS, RATE_LIMIT };
