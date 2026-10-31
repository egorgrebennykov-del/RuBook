import getExchangeRate, { DEFAULT_RATE, getCachedExchangeRate } from "./getExchangeRate.js";
import dedupeBooks from "./dedupeBooks.js";
import decodeHtmlEntities from "./decodeHtmlEntities.js";

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

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const tokenize = (s) => (s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export function isCoreWorkMatch(title, query) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return false;
  const queryPhrase = queryTokens.join(" ");
  const titleTokens = tokenize(title);
  if (!titleTokens.length) return false;
  const titlePhrase = titleTokens.join(" ");

  if (titlePhrase === queryPhrase) return true;
  if (titlePhrase.startsWith(queryPhrase + " ")) return true;
  return titlePhrase.includes(queryPhrase);
}

export function calculateRelevance(item, query) {
  const title = (item.title || item.name || "").toLowerCase();
  const q = (query || "").toLowerCase().trim();
  if (!q) return 50;

  if (title === q) return 100;
  if (title.startsWith(q)) return 90;
  if (isCoreWorkMatch(title, q)) return 85;
  if (title.includes(q)) return 75;

  const qTokens = tokenize(q);
  const tTokens = new Set(tokenize(title));
  let matched = 0;
  for (const token of qTokens) {
    if (tTokens.has(token)) matched++;
  }
  const ratio = qTokens.length ? matched / qTokens.length : 0;
  return Math.round(ratio * 70);
}

function rankAndSort(books, query) {
  return [...books].sort((a, b) => {
    const relA = calculateRelevance(a, query);
    const relB = calculateRelevance(b, query);
    if (relA !== relB) return relB - relA;
    // Prefer books with real covers
    if (Boolean(a.image) !== Boolean(b.image)) {
      return a.image ? -1 : 1;
    }
    return (a.price || 0) - (b.price || 0);
  });
}

function normalizeDbBook(row, rate = DEFAULT_RATE) {
  if (!row) return null;
  const info = row.info || {};
  const eurPrice = Number(row.price) > 0 ? Number(row.price) : 5.99;
  const rubPrice = Number(info.price_rub) > 0 ? Number(info.price_rub) : Math.round(eurPrice * rate);

  return {
    id: row.id,
    title: decodeHtmlEntities(row.name || "Книга без названия"),
    price: eurPrice,
    currency: "EUR",
    price_rub: rubPrice,
    url: `/book/${row.id}`,
    image: row.image || null,
    store: row.publisher || "Transbaltik",
    publisher: row.publisher || "Издательство",
    author: decodeHtmlEntities(info.author || ""),
    isbn: info.isbn || "",
    year: info.year || "",
    code: info.code || "",
    series: info.series || "",
    genre: info.genre || "",
    description: info.description || "",
    source: info.source || "https://www.transbaltik.ru/pricelists"
  };
}

export default async function searchBooks(searchBook, options = {}) {
  const query = (searchBook || "").trim();
  const onProgress = typeof options === "function" ? options : options.onProgress;
  const activeRate = getCachedExchangeRate() || DEFAULT_RATE;

  try {
    let url = `${TABLE_URL}?select=id,name,price,publisher,image,info&order=id.asc&limit=100`;

    if (query) {
      const clean = encodeURIComponent(`*${query}*`);
      // Search in name or publisher
      url = `${TABLE_URL}?select=id,name,price,publisher,image,info&or=(name.ilike.${clean},publisher.ilike.${clean})&order=id.asc&limit=150`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn("Supabase books query failed:", response.status);
      return [];
    }

    const rows = await response.json();
    const normalized = (rows || []).map((r) => normalizeDbBook(r, activeRate));

    const sorted = rankAndSort(normalized, query);
    if (typeof onProgress === "function") {
      onProgress(sorted);
    }

    return sorted;
  } catch (err) {
    console.warn("searchBooks error:", err.message);
    return [];
  }
}
