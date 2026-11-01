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
const HOME_PAGE_TABLE_URL = `${SUPABASE_URL}/rest/v1/books_on_home_page`;

export const ALLOWED_HOMEPAGE_PUBLISHERS = [
  { key: "alpina", name: "Альпина", pattern: /альпин/i, query: "publisher=ilike.*Альпин*" },
  { key: "ast", name: "АСТ", pattern: /\bаст\b|издательство\s*аст/i, query: "publisher=ilike.*АСТ*" },
  { key: "eksmo", name: "Эксмо", pattern: /эксмо/i, query: "publisher=ilike.*Эксмо*" },
  { key: "mif", name: "МИФ", pattern: /\bмиф\b|манн[,\s]+иванов/i, query: "publisher=ilike.*МИФ*" },
  { key: "popuri", name: "Попурри", pattern: /попурри/i, query: "publisher=ilike.*Попурри*" },
];

export function getPublisherCategory(publisherName, bookTitle = "") {
  const str = `${publisherName || ""} ${bookTitle || ""}`.toLowerCase();
  for (const pub of ALLOWED_HOMEPAGE_PUBLISHERS) {
    if (pub.pattern.test(str)) {
      return pub.name;
    }
  }
  return null;
}

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
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    };

    const seenPublishers = new Set();
    const selected = [];

    try {
      // 1. Fetch from books_on_home_page table
      const response = await fetch(
        `${HOME_PAGE_TABLE_URL}?select=books&limit=1`,
        { headers }
      );

      if (response.ok) {
        const rows = await response.json();
        const list = rows?.[0]?.books;
        if (Array.isArray(list)) {
          for (const b of list) {
            if (!b || !b.image || !hasValidImageUrl(b.image)) continue;
            const cat = getPublisherCategory(b.publisher, b.title);
            if (cat && !seenPublishers.has(cat)) {
              seenPublishers.add(cat);
              selected.push({
                id: b.id,
                title: b.title,
                url: b.url || `/book/${b.id}`,
                image: b.image,
                price: Number(b.price) || 5.99,
                currency: "EUR",
                publisher: cat,
                store: cat,
                author: b.author || "",
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not load from books_on_home_page:", err);
    }

    // 2. Fallback: ensure all 5 target publishers are represented
    for (const pub of ALLOWED_HOMEPAGE_PUBLISHERS) {
      if (!seenPublishers.has(pub.name)) {
        try {
          const res = await fetch(
            `${TABLE_URL}?select=id,name,price,publisher,image,info&image=not.is.null&${pub.query}&limit=10`,
            { headers }
          );
          if (res.ok) {
            const rows = await res.json();
            const valid = (rows || []).find((b) => b && b.image && hasValidImageUrl(b.image));
            if (valid) {
              seenPublishers.add(pub.name);
              selected.push({
                id: valid.id,
                title: valid.name,
                url: `/book/${valid.id}`,
                image: valid.image,
                price: Number(valid.price) || 5.99,
                currency: "EUR",
                publisher: pub.name,
                store: pub.name,
                author: valid.info?.author || "",
              });
            }
          }
        } catch (err) {
          console.warn(`Could not fallback load book for ${pub.name}:`, err);
        }
      }
    }

    // 3. Strictly sort according to target publisher sequence (Альпина, АСТ, Эксмо, МИФ, Попурри)
    const publisherOrder = ALLOWED_HOMEPAGE_PUBLISHERS.map((p) => p.name);
    selected.sort(
      (a, b) => publisherOrder.indexOf(a.publisher) - publisherOrder.indexOf(b.publisher)
    );

    const finalBooks = selected.slice(0, 5);
    if (finalBooks.length > 0) {
      cachedBooks = finalBooks;
      cacheExpiry = Date.now() + CACHE_TTL_MS;
      return finalBooks;
    }

    return cachedBooks || [];
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
