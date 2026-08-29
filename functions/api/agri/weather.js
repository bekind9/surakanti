import { jsonResponse, optionsResponse } from "./_shared.js";

const CACHE_SECONDS = 30 * 60;
const LATITUDE = 18.7475;
const LONGITUDE = 78.685;

async function fetchWeather() {
  const cacheKey = new Request("https://cache.surakanti.net/agri/weather/kathlapur-v2");
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached.json();

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(LATITUDE));
  url.searchParams.set("longitude", String(LONGITUDE));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", "Asia/Kolkata");
  url.searchParams.set("forecast_days", "7");

  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`weather status ${response.status}`);
  const source = await response.json();
  const firstHour = Math.max(0, (source.hourly?.time || []).findIndex((time) => time >= source.current?.time));
  const hourly = (source.hourly?.time || []).slice(firstHour, firstHour + 12).map((time, index) => ({
    time,
    temperature_c: source.hourly?.temperature_2m?.[firstHour + index],
    rain_probability_percent: source.hourly?.precipitation_probability?.[firstHour + index],
    weather_code: source.hourly?.weather_code?.[firstHour + index],
  }));
  const daily = (source.daily?.time || []).slice(0, 7).map((date, index) => ({
    date,
    weather_code: source.daily?.weather_code?.[index],
    max_temperature_c: source.daily?.temperature_2m_max?.[index],
    min_temperature_c: source.daily?.temperature_2m_min?.[index],
    rain_probability_percent: source.daily?.precipitation_probability_max?.[index],
  }));
  const payload = {
    location: "కథలాపూర్, జగిత్యాల",
    observed_at: source.current?.time,
    temperature_c: source.current?.temperature_2m,
    humidity_percent: source.current?.relative_humidity_2m,
    precipitation_mm: source.current?.precipitation,
    weather_code: source.current?.weather_code,
    wind_kmh: source.current?.wind_speed_10m,
    today: daily[0],
    hourly,
    daily,
    fetched_at: Date.now(),
  };

  if (cache) {
    await cache.put(cacheKey, new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
    }));
  }
  return payload;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return optionsResponse(request, env);
  if (request.method !== "GET") return jsonResponse(request, env, { error: "Method not allowed" }, 405);
  try {
    return jsonResponse(request, env, await fetchWeather(), 200, { "Cache-Control": "public, max-age=300" });
  } catch {
    return jsonResponse(request, env, { error: "వాతావరణ సమాచారం ప్రస్తుతం అందుబాటులో లేదు." }, 503);
  }
}
