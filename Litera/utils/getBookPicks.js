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

const TABLE_URL = `${SUPABASE_URL}/rest/v1/books`;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedPicks = null;
let cacheExpiry = 0;
let inflight = null;

export function getCachedBookPicks() {
  return cachedPicks;
}

export default async function getBookPicks() {
  if (cachedPicks !== null && Date.now() < cacheExpiry) {
    return cachedPicks;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch(
        `${TABLE_URL}?select=id,name,price,publisher,image,info&order=id.asc&limit=30`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Could not load Book Picks");
      }

      const rows = await response.json();
      const result = (rows || []).map((b) => ({
        id: b.id,
        title: b.name,
        url: `/book/${b.id}`,
        image: b.image || null,
        price: Number(b.price) || 5.99,
        currency: "EUR",
        publisher: b.publisher || "Transbaltik",
        store: b.publisher || "Transbaltik",
        author: b.info?.author || "",
        price_rub: b.info?.price_rub || Math.round((Number(b.price) || 5.99) * 84)
      }));

      cachedPicks = result;
      cacheExpiry = Date.now() + CACHE_TTL_MS;
      return result;
    } catch (err) {
      console.warn("getBookPicks error:", err.message);
      return cachedPicks || [];
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
