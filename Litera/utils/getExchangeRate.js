const env =
  (typeof import.meta !== "undefined" && import.meta.env) ||
  globalThis.process?.env ||
  {};

const SUPABASE_URL =
  env.VITE_SUPABASE_URL ||
  env.SUPABASE_URL ||
  "https://qgxiisgzwcsevzyaoxvl.supabase.co";

const SUPABASE_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  env.SUPABASE_SECRET_KEY ||
  "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

// In-memory cache: avoids repeated Supabase fetches within the same session.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedRate = null;
let cacheExpiry = 0;
let inflight = null;

// Official default rate from https://www.transbaltik.ru/pricelists: КУРС EUR/RUB: 84.00
export const DEFAULT_RATE = 84.0;

export function getCachedExchangeRate() {
  return cachedRate || DEFAULT_RATE;
}

export function convertEurToRub(eur, rate = cachedRate || DEFAULT_RATE) {
  const num = Number(eur);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * (rate || DEFAULT_RATE));
}

export function convertRubToEur(rub, rate = cachedRate || DEFAULT_RATE) {
  const num = Number(rub);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num / (rate || DEFAULT_RATE)) * 100) / 100;
}

export default async function getExchangeRate() {
  if (cachedRate !== null && Date.now() < cacheExpiry) return cachedRate;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // 1. Try querying Supabase exchange_rate for EUR/RUB
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/exchange_rate?select=rate&base_currency=eq.EUR&quote_currency=eq.RUB&limit=1`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        const rate = Number(data[0]?.rate);
        if (Number.isFinite(rate) && rate > 0) {
          cachedRate = rate;
          cacheExpiry = Date.now() + CACHE_TTL_MS;
          return rate;
        }
      }
    } catch (error) {
      console.warn("Error fetching exchange rate from Supabase:", error.message);
    }

    // 2. Fallback to scraping transbaltik.ru directly if running in Node / Worker
    try {
      const res = await fetch("https://www.transbaltik.ru/pricelists");
      if (res.ok) {
        const html = await res.text();
        const match = html.match(/КУРС\s*EUR\/RUB:\s*([\d.,]+)/i);
        if (match && match[1]) {
          const parsed = Number(match[1].replace(",", "."));
          if (Number.isFinite(parsed) && parsed > 0) {
            cachedRate = parsed;
            cacheExpiry = Date.now() + CACHE_TTL_MS;
            return parsed;
          }
        }
      }
    } catch {
      // fallback below
    }

    cachedRate = cachedRate || DEFAULT_RATE;
    return cachedRate;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
