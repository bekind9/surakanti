import {
  consumeRateLimit,
  findSession,
  jsonResponse,
  optionsResponse,
  recordLatency,
  requireDatabase,
} from "./_shared.js";

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const CACHE_SECONDS = 60 * 60;

const MARKETS = {
  nizamabad: { label: "నిజామాబాద్", matches: (row) => /nizamabad apmc/i.test(row.market || "") },
  warangal: { label: "వరంగల్", matches: (row) => /warangal apmc/i.test(row.market || "") },
  hyderabad: { label: "హైదరాబాద్", matches: (row) => /^hyderabad$/i.test(row.district || "") },
  karimnagar: { label: "కరీంనగర్", matches: (row) => /karimnagar apmc/i.test(row.market || "") },
  metpally: { label: "మెట్‌పల్లి", matches: (row) => /metpally|metpalli/i.test(row.market || "") },
};

const CROPS = {
  maize: { label: "మొక్కజొన్న", matches: (row) => /^maize$/i.test(row.commodity || "") },
  rice: { label: "వరి / బియ్యం", matches: (row) => /paddy|rice/i.test(row.commodity || "") },
  turmeric: { label: "పసుపు", matches: (row) => /^turmeric$/i.test(row.commodity || "") },
  chilli: { label: "మిర్చి", matches: (row) => /chilli/i.test(row.commodity || "") },
  sesame: { label: "నువ్వులు", matches: (row) => /sesam/i.test(row.commodity || "") },
};

function dateValue(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value || "");
  return match ? Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : 0;
}

export function filterMandiRecords(records, marketKey, cropKey) {
  const market = MARKETS[marketKey];
  const crop = CROPS[cropKey];
  if (!market || !crop) return null;
  return records
    .filter((row) => market.matches(row) && crop.matches(row))
    .sort((a, b) => dateValue(b.arrival_date) - dateValue(a.arrival_date))
    .slice(0, 20)
    .map((row) => ({
      district: row.district,
      market: row.market,
      commodity: row.commodity,
      variety: row.variety,
      arrival_date: row.arrival_date,
      min_price: Number(row.min_price),
      max_price: Number(row.max_price),
      modal_price: Number(row.modal_price),
    }));
}

async function fetchTelanganaRecords(env) {
  const cacheKey = new Request("https://cache.surakanti.net/agri/mandi/telangana-v1");
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached.json();

  const url = new URL(`https://api.data.gov.in/resource/${RESOURCE_ID}`);
  url.searchParams.set("api-key", env.DATA_GOV_IN_API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1000");
  url.searchParams.set("filters[state]", "Telangana");
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`data.gov.in status ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result?.records)) throw new Error("data.gov.in records missing");
  const payload = { records: result.records, fetched_at: Date.now() };
  if (cache) {
    await cache.put(cacheKey, new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      },
    }));
  }
  return payload;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return optionsResponse(request, env);
  if (request.method !== "GET") return jsonResponse(request, env, { error: "Method not allowed" }, 405);

  const startedAt = Date.now();
  let db;
  try {
    db = requireDatabase(env);
    const session = await findSession(request, env);
    if (!session) return jsonResponse(request, env, { error: "ముందుగా పైలట్ ఆహ్వాన కోడ్ నమోదు చేయండి." }, 401);
    if (!env.DATA_GOV_IN_API_KEY) return jsonResponse(request, env, { error: "మండి ధరల సేవ కాన్ఫిగర్ కాలేదు." }, 503);

    const url = new URL(request.url);
    const marketKey = url.searchParams.get("market") || "";
    const cropKey = url.searchParams.get("crop") || "";
    if (!MARKETS[marketKey] || !CROPS[cropKey]) {
      return jsonResponse(request, env, { error: "మార్కెట్ మరియు పంటను ఎంచుకోండి." }, 400);
    }

    const limit = await consumeRateLimit(db, session.invite_id);
    if (!limit.allowed) return jsonResponse(request, env, {
      error: "గంటకు 30 అభ్యర్థనల పైలట్ పరిమితి పూర్తయింది. కొంతసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
      retry_after: limit.retryAfter,
    }, 429, { "Retry-After": String(limit.retryAfter) });

    const payload = await fetchTelanganaRecords(env);
    const records = filterMandiRecords(payload.records, marketKey, cropKey);
    await recordLatency(db, "/api/agri/mandi", startedAt, "data.gov.in", "ok");
    return jsonResponse(request, env, {
      market: { id: marketKey, label: MARKETS[marketKey].label },
      crop: { id: cropKey, label: CROPS[cropKey].label },
      unit: "₹ / క్వింటాల్",
      fetched_at: payload.fetched_at,
      records,
    }, 200, { "Cache-Control": "private, no-store" });
  } catch {
    if (db) {
      try { await recordLatency(db, "/api/agri/mandi", startedAt, "data.gov.in", "error"); } catch {}
    }
    return jsonResponse(request, env, { error: "మండి ధరలు ప్రస్తుతం అందుబాటులో లేవు." }, 503);
  }
}
