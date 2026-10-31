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

export const tokenize = (s) =>
  (s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export function buildOrQuery(query) {
  const raw = (query || "").trim();
  const tokens = tokenize(raw);
  if (!tokens.length) return "";

  const conditions = [];
  const fields = [
    "name",
    "publisher",
    "info->>author",
    "info->>series",
    "info->>genre",
    "info->>isbn",
    "info->>code",
  ];

  // 1. Full phrase across fields
  for (const f of fields) {
    conditions.push(`${f}.ilike.*${raw}*`);
  }

  // 2. If multiple tokens, add forward & reverse joined wildcards
  if (tokens.length > 1) {
    const fwd = `*${tokens.join("*")}*`;
    const rev = `*${[...tokens].reverse().join("*")}*`;
    conditions.push(`name.ilike.${fwd}`, `name.ilike.${rev}`);
    conditions.push(`info->>author.ilike.${fwd}`, `info->>author.ilike.${rev}`);
    conditions.push(`info->>series.ilike.${fwd}`, `info->>series.ilike.${rev}`);

    // Also each token (>= 3 chars) across name and author
    for (const t of tokens) {
      if (t.length >= 3) {
        conditions.push(`name.ilike.*${t}*`);
        conditions.push(`info->>author.ilike.*${t}*`);
      }
    }
  }

  return `(${conditions.join(",")})`;
}

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
  const q = (query || "").toLowerCase().trim();
  if (!q) return 50;

  const title = (item.title || item.name || "").toLowerCase();
  const author = (item.author || item.info?.author || "").toLowerCase();
  const series = (item.series || item.info?.series || "").toLowerCase();
  const publisher = (item.publisher || "").toLowerCase();
  const code = (item.code || item.info?.code || "").toLowerCase();
  const isbn = (item.isbn || item.info?.isbn || "").toLowerCase();

  // 1. Exact matches
  if (title === q) return 100;
  if (author === q || author.startsWith(q + " ") || author.includes(" " + q)) return 95;
  if (title.startsWith(q)) return 92;
  if (title.includes(q)) return 88;
  if (series === q || series.includes(q)) return 82;
  if (publisher === q || publisher.includes(q)) return 78;
  if (code.includes(q) || isbn.includes(q)) return 85;

  // 2. Tokenized match
  const qTokens = tokenize(q);
  if (!qTokens.length) return 50;

  const tTokens = new Set(tokenize(title));
  const aTokens = new Set(tokenize(author));
  const sTokens = new Set(tokenize(series));

  let titleMatches = 0;
  let anyMatches = 0;

  for (const token of qTokens) {
    const inTitle = tTokens.has(token) || [...tTokens].some((t) => t.includes(token));
    const inAuthor = aTokens.has(token) || [...aTokens].some((a) => a.includes(token));
    const inSeries = sTokens.has(token) || [...sTokens].some((s) => s.includes(token));

    if (inTitle) titleMatches++;
    if (inTitle || inAuthor || inSeries) anyMatches++;
  }

  // All tokens matched in title
  if (titleMatches === qTokens.length) return 86;
  // All tokens matched across title, author, or series
  if (anyMatches === qTokens.length) return 80;

  const ratio = anyMatches / qTokens.length;
  return Math.round(ratio * 65);
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

function normalizeDbBook(row) {
  if (!row) return null;
  const info = row.info || {};
  const eurPrice = Number(row.price) > 0 ? Number(row.price) : 5.99;

  return {
    id: row.id,
    title: decodeHtmlEntities(row.name || "Книга без названия"),
    price: eurPrice,
    currency: "EUR",
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
    source: info.source || "https://www.transbaltik.ru/pricelists",
  };
}

export default async function searchBooks(searchBook, options = {}) {
  const query = (searchBook || "").trim();
  const onProgress = typeof options === "function" ? options : options.onProgress;

  try {
    let url = `${TABLE_URL}?select=id,name,price,publisher,image,info&order=id.asc&limit=100`;

    if (query) {
      const orCondition = buildOrQuery(query);
      url = `${TABLE_URL}?select=id,name,price,publisher,image,info&or=${encodeURIComponent(orCondition)}&order=id.asc&limit=150`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn("Supabase books query failed:", response.status);
      return [];
    }

    const rows = await response.json();
    const normalized = (rows || []).map((r) => normalizeDbBook(r));

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
