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
let cachedSnapshot = null;
let cacheExpiry = 0;
let inflight = null;

export function getCachedDiscountSnapshot() {
  return cachedSnapshot;
}

export default async function getDiscountSnapshot() {
  if (cachedSnapshot !== null && Date.now() < cacheExpiry) {
    return cachedSnapshot;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch(
        `${TABLE_URL}?select=id,name,price,publisher,image,info&image=not.is.null&limit=30`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Could not load discount books");
      }

      const rows = await response.json();
      const discounts = [15, 20, 25, 30, 10];
      const products = (rows || []).map((b, idx) => {
        const discountPct = discounts[idx % discounts.length];
        const basePrice = Number(b.price) || 6.99;
        const discountedPrice = Math.round((basePrice * (1 - discountPct / 100)) * 100) / 100;
        const originalPrice = Math.round((basePrice * 1.25) * 100) / 100;

        return {
          id: b.id,
          title: b.name,
          url: `/book/${b.id}`,
          image: b.image || null,
          price: discountedPrice,
          discountedPrice,
          originalPrice,
          discount: `${discountPct}%`,
          currency: "EUR",
          store: b.publisher || "Transbaltik",
          publisher: b.publisher || "Transbaltik",
          author: b.info?.author || "",
          price_rub: Math.round(discountedPrice * 84)
        };
      });

      const result = {
        updatedAt: new Date().toISOString(),
        products
      };

      cachedSnapshot = result;
      cacheExpiry = Date.now() + CACHE_TTL_MS;
      return result;
    } catch (err) {
      console.warn("getDiscountSnapshot error:", err.message);
      return cachedSnapshot || { updatedAt: null, products: [] };
    }
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
