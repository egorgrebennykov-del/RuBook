import { hasValidImageUrl } from "./enhancedImageUrl.js";

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

const STORAGE_KEY = "kazbook_homepage_books_v2";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedBooks = null;
let cacheExpiry = 0;
let inflight = null;

export function getCachedHomepageBooks() {
  return cachedBooks;
}

export default async function getHomepageBooks() {
  if (cachedBooks !== null && Date.now() < cacheExpiry) {
    return cachedBooks;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // Fetch books with images or top books from Supabase
      const response = await fetch(
        `${TABLE_URL}?select=id,name,price,publisher,image,info&image=not.is.null&limit=10`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        },
      );

      let rows = response.ok ? await response.json() : [];

      if (!rows || rows.length < 5) {
        // Fallback: books with images
        const fallbackRes = await fetch(
          `${TABLE_URL}?select=id,name,price,publisher,image,info&image=not.is.null&limit=15`,
          {
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
            },
          },
        );
        if (fallbackRes.ok) {
          rows = await fallbackRes.json();
        }
      }

      if (Array.isArray(rows) && rows.length > 0) {
        const result = rows
          .filter((b) => b && b.image && hasValidImageUrl(b.image))
          .map((b) => ({
          id: b.id,
          title: b.name,
          url: `/book/${b.id}`,
          image: b.image || null,
          price: Number(b.price) || 5.99,
          currency: "EUR",
          store: b.publisher || "Transbaltik",
          publisher: b.publisher || "Издательство",
          author: b.info?.author || "",
          price_rub: b.info?.price_rub || Math.round((Number(b.price) || 5.99) * 84)
        }));

        cachedBooks = result;
        cacheExpiry = Date.now() + CACHE_TTL_MS;
        return result;
      }
    } catch (err) {
      console.warn("Could not load homepage books from Supabase:", err);
    }

    return cachedBooks || [];
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
