import {
  clearSessionCookie,
  findSession,
  jsonResponse,
  optionsResponse,
  readJson,
  requireDatabase,
  sessionCookie,
  sha256,
} from "./_shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return optionsResponse(request, env);
  if (request.method !== "POST") return jsonResponse(request, env, { error: "Method not allowed" }, 405);

  const body = await readJson(request);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code || code.length > 128) return jsonResponse(request, env, { error: "చెల్లని ఆహ్వాన కోడ్." }, 400);

  try {
    const db = requireDatabase(env);
    const codeHash = await sha256(code);
    const invite = await db.prepare(
      `SELECT id, code_label FROM agri_invites
       WHERE code_hash = ? AND active = 1
       AND (expires_at IS NULL OR expires_at > ?)`
    ).bind(codeHash, Date.now()).first();
    if (!invite) return jsonResponse(request, env, { error: "ఆహ్వాన కోడ్ సరైనది కాదు." }, 401);

    const current = await db.prepare("SELECT COUNT(*) AS uses FROM agri_sessions WHERE invite_id = ?").bind(invite.id).first();
    if (Number(current?.uses || 0) >= 500) return jsonResponse(request, env, { error: "ఈ ఆహ్వాన కోడ్ వినియోగ పరిమితిని చేరుకుంది." }, 403);

    const sessionId = crypto.randomUUID();
    const token = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO agri_sessions (id, token_hash, invite_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(sessionId, await sha256(token), invite.id, Date.now(), Date.now() + 30 * 24 * 60 * 60 * 1000).run();

    return jsonResponse(request, env, { ok: true, label: invite.code_label || "pilot" }, 200, {
      "Set-Cookie": sessionCookie(token),
    });
  } catch {
    return jsonResponse(request, env, { error: "సేవ తాత్కాలికంగా అందుబాటులో లేదు." }, 503, {
      "Set-Cookie": clearSessionCookie(),
    });
  }
}
