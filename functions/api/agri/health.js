import { jsonResponse, optionsResponse, requireDatabase } from "./_shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return optionsResponse(request, env);
  if (request.method !== "GET") return jsonResponse(request, env, { error: "Method not allowed" }, 405);
  try {
    const db = requireDatabase(env);
    await db.prepare("SELECT 1 AS ok").first();
    return jsonResponse(request, env, {
      ok: true,
      service: "surakanti-agri-api",
      database: "ok",
      muse_configured: Boolean(env.MUSE_API_KEY),
      voice_configured: Boolean(env.AI),
      mandi_configured: Boolean(env.DATA_GOV_IN_API_KEY),
      timestamp: new Date().toISOString(),
    });
  } catch {
    return jsonResponse(request, env, {
      ok: false,
      service: "surakanti-agri-api",
      database: "unavailable",
      muse_configured: Boolean(env.MUSE_API_KEY),
      voice_configured: Boolean(env.AI),
      mandi_configured: Boolean(env.DATA_GOV_IN_API_KEY),
    }, 503);
  }
}
