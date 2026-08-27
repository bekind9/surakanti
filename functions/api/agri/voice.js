import { jsonResponse, optionsResponse } from "./_shared.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return optionsResponse(request, env);
  return jsonResponse(request, env, {
    error: "తెలుగు వాయిస్ సేవ త్వరలో అందుబాటులోకి వస్తుంది.",
    status: "not_implemented",
  }, 501);
}
