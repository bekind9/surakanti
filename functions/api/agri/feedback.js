import { findSession, jsonResponse, optionsResponse, readJson, requireDatabase } from "./_shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return optionsResponse(request, env);
  if (request.method !== "POST") return jsonResponse(request, env, { error: "Method not allowed" }, 405);
  try {
    const session = await findSession(request, env);
    if (!session) return jsonResponse(request, env, { error: "ముందుగా పైలట్ ఆహ్వాన కోడ్ నమోదు చేయండి." }, 401);
    const body = await readJson(request);
    const rating = Number(body?.rating);
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return jsonResponse(request, env, { error: "రేటింగ్ 1 నుంచి 5 మధ్య ఉండాలి." }, 400);
    const db = requireDatabase(env);
    await db.prepare("INSERT INTO agri_feedback (session_id, rating, note, created_at) VALUES (?, ?, ?, ?)").bind(session.id, rating, note, Date.now()).run();
    return jsonResponse(request, env, { ok: true });
  } catch {
    return jsonResponse(request, env, { error: "ఫీడ్‌బ్యాక్ సేవ్ కాలేదు." }, 503);
  }
}
