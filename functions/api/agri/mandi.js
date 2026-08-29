import {
  jsonResponse,
  optionsResponse,
} from "./_shared.js";

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const CACHE_SECONDS = 24 * 60 * 60;

const MARKETS = {
  nizamabad: { label: "నిజామాబాద్", matches: (row) => /nizamabad apmc/i.test(row.market || "") },
  warangal: { label: "వరంగల్", matches: (row) => /warangal apmc/i.test(row.market || "") },
  karimnagar: { label: "కరీంనగర్", matches: (row) => /karimnagar apmc/i.test(row.market || "") },
  metpally: { label: "మెట్‌పల్లి", matches: (row) => /metpally|metpalli/i.test(row.market || "") },
  korutla: { label: "కోరుట్ల", matches: (row) => /korutla|koratla/i.test(row.market || "") },
};

const CROPS = {
  maize: { label: "మొక్కజొన్న", matches: (row) => /^maize$/i.test(row.commodity || "") },
  rice: { label: "వరి / బియ్యం", matches: (row) => /paddy|rice/i.test(row.commodity || "") },
  turmeric: { label: "పసుపు", matches: (row) => /^turmeric$/i.test(row.commodity || "") },
  chilli: { label: "మిర్చి", matches: (row) => /chilli/i.test(row.commodity || "") },
  sesame: { label: "నువ్వులు", matches: (row) => /sesam/i.test(row.commodity || "") },
};

const MARKET_NAMES_TE = {
  "Nizamabad APMC": "నిజామాబాద్ ఏపీఎంసీ",
  "Warangal APMC": "వరంగల్ ఏపీఎంసీ",
  "Cherial APMC": "చేర్యాల ఏపీఎంసీ",
  "Karimnagar APMC": "కరీంనగర్ ఏపీఎంసీ",
  "Metpally APMC": "మెట్‌పల్లి ఏపీఎంసీ",
  "Korutla APMC": "కోరుట్ల ఏపీఎంసీ",
  "Koratla APMC": "కోరుట్ల ఏపీఎంసీ",
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
      market_name_te: MARKET_NAMES_TE[row.market] || market.label,
      commodity: row.commodity,
      variety: row.variety,
      arrival_date: row.arrival_date,
      min_price: Number(row.min_price),
      max_price: Number(row.max_price),
      modal_price: Number(row.modal_price),
    }));
}

export function filterMarketRecords(records, marketKey) {
  const market = MARKETS[marketKey];
  if (!market) return null;
  return records
    .filter((row) => market.matches(row) && Object.values(CROPS).some((crop) => crop.matches(row)))
    .sort((a, b) => dateValue(b.arrival_date) - dateValue(a.arrival_date) ||
      String(a.commodity || "").localeCompare(String(b.commodity || "")))
    .slice(0, 100)
    .map((row) => {
      const crop = Object.values(CROPS).find((item) => item.matches(row));
      return {
        district: row.district,
        market: row.market,
        market_name_te: MARKET_NAMES_TE[row.market] || market.label,
        commodity: row.commodity,
        crop_label: crop?.label || row.commodity,
        variety: row.variety,
        arrival_date: row.arrival_date,
        min_price: Number(row.min_price),
        max_price: Number(row.max_price),
        modal_price: Number(row.modal_price),
      };
    });
}

export function filterTargetMarketRecords(records) {
  return Object.keys(MARKETS).flatMap((marketKey) =>
    filterMarketRecords(records, marketKey).map((record) => ({ ...record, market_key: marketKey })),
  );
}

export function filterAllMandiRecords(records) {
  const output = [];
  for (const [marketKey, market] of Object.entries(MARKETS)) {
    for (const [cropKey, crop] of Object.entries(CROPS)) {
      for (const record of filterMandiRecords(records, marketKey, cropKey) || []) {
        output.push({
          ...record,
          market_key: marketKey,
          market_label: market.label,
          crop_key: cropKey,
          crop_label: crop.label,
        });
      }
    }
  }
  return output.slice(0, 50);
}

async function fetchTelanganaRecords(env) {
  const cacheKey = new Request("https://cache.surakanti.net/agri/mandi/telangana-v2");
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

  try {
    if (!env.DATA_GOV_IN_API_KEY) return jsonResponse(request, env, { error: "మండి ధరల సేవ కాన్ఫిగర్ కాలేదు." }, 503);

    const url = new URL(request.url);
    const marketKey = url.searchParams.get("market") || "";
    const cropKey = url.searchParams.get("crop") || "";
    if ((marketKey && !MARKETS[marketKey]) || (cropKey && (!marketKey || !CROPS[cropKey]))) {
      return jsonResponse(request, env, { error: "చెల్లని మార్కెట్ లేదా పంట." }, 400);
    }

    const payload = await fetchTelanganaRecords(env);
    const records = cropKey
      ? filterMandiRecords(payload.records, marketKey, cropKey)
      : marketKey
        ? filterMarketRecords(payload.records, marketKey)
        : filterTargetMarketRecords(payload.records);
    return jsonResponse(request, env, {
      market: marketKey ? { id: marketKey, label: MARKETS[marketKey].label } : null,
      crop: cropKey ? { id: cropKey, label: CROPS[cropKey].label } : null,
      unit: "₹ / క్వింటాల్",
      fetched_at: payload.fetched_at,
      records,
    }, 200, { "Cache-Control": "public, max-age=300" });
  } catch {
    return jsonResponse(request, env, { error: "మండి ధరలు ప్రస్తుతం అందుబాటులో లేవు." }, 503);
  }
}
