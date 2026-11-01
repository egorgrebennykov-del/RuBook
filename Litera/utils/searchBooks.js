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

export function getWordStem(word) {
  if (!word || word.length < 4) return word;
  const stem = word.replace(
    /(?:ами|ями|ого|его|ому|ему|ыми|ими|ным|ним|ная|ное|ные|ных|ной|ней|ский|ская|ское|ские|ских|ской|ского|ов|ев|ей|ам|ям|ах|ях|ом|ем|ой|ей|ия|ию|ии|ие|а|я|ы|и|е|у|ю|о)$/iu,
    ""
  );
  return stem.length >= 3 ? stem : word;
}

export function buildOrQuery(query) {
  const tokens = tokenize(query);
  if (!tokens.length) return "";

  const cleanPhrase = tokens.join(" ");
  const conditions = [];

  const textFields = [
    "name",
    "publisher",
    "info->>author",
    "info->>series",
    "info->>genre",
  ];

  // 1. Safe phrase match (only letters and numbers with spaces)
  if (cleanPhrase.length >= 2) {
    for (const f of textFields) {
      conditions.push(`${f}.ilike.*${cleanPhrase}*`);
    }
  }

  // 2. Token joined wildcards for multi-word phrases
  if (tokens.length > 1) {
    const fwd = `*${tokens.join("*")}*`;
    const rev = `*${[...tokens].reverse().join("*")}*`;
    conditions.push(`name.ilike.${fwd}`, `name.ilike.${rev}`);
    conditions.push(`info->>author.ilike.${fwd}`, `info->>author.ilike.${rev}`);
    conditions.push(`info->>series.ilike.${fwd}`, `info->>series.ilike.${rev}`);
  }

  // 3. Stems and individual tokens across fields
  const processedTokens = new Set();
  for (const t of tokens) {
    if (t.length >= 2) processedTokens.add(t);
    const stem = getWordStem(t);
    if (stem.length >= 3) processedTokens.add(stem);
  }

  for (const term of processedTokens) {
    conditions.push(`name.ilike.*${term}*`);
    conditions.push(`info->>author.ilike.*${term}*`);
    conditions.push(`info->>series.ilike.*${term}*`);
    if (term.length >= 3) {
      conditions.push(`publisher.ilike.*${term}*`);
      conditions.push(`info->>code.ilike.*${term}*`);
      conditions.push(`info->>isbn.ilike.*${term}*`);
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

  // 1. Exact phrase matches
  if (title === q) return 100;
  if (author === q || author.startsWith(q + " ") || author.includes(" " + q)) return 96;
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
    const stem = getWordStem(token);
    const inTitle =
      tTokens.has(token) ||
      [...tTokens].some((t) => t.includes(token) || (stem && t.includes(stem)));
    const inAuthor =
      aTokens.has(token) ||
      [...aTokens].some((a) => a.includes(token) || (stem && a.includes(stem)));
    const inSeries =
      sTokens.has(token) ||
      [...sTokens].some((s) => s.includes(token) || (stem && s.includes(stem)));

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

function hasValidImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  const str = url.trim();
  if (!str.startsWith("http://") && !str.startsWith("https://")) return false;
  if (str.length < 10) return false;
  const lower = str.toLowerCase();
  if (
    lower.includes(".html") ||
    lower.includes(".htm") ||
    lower.includes(".php") ||
    lower.includes("route=product") ||
    lower.includes("product_id=") ||
    lower.includes("go.ast.ru/")
  ) {
    return false;
  }
  return true;
}

function normalizeDbBook(row) {
  if (!row) return null;
  const info = row.info || {};
  const eurPrice = Number(row.price) > 0 ? Number(row.price) : 5.99;
  const validImage = hasValidImageUrl(row.image) ? row.image : null;

  return {
    id: row.id,
    title: decodeHtmlEntities(row.name || "Книга без названия"),
    price: eurPrice,
    currency: "EUR",
    url: `/book/${row.id}`,
    image: validImage,
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
    let url = `${TABLE_URL}?select=id,name,price,publisher,image,info&image=not.is.null&order=id.asc&limit=100`;

    if (query) {
      const orCondition = buildOrQuery(query);
      if (orCondition) {
        url = `${TABLE_URL}?select=id,name,price,publisher,image,info&image=not.is.null&or=${encodeURIComponent(orCondition)}&order=id.asc&limit=150`;
      }
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn("Supabase books query failed:", response.status);
      return [];
    }

    const rows = await response.json();
    const normalized = (rows || [])
      .map((r) => normalizeDbBook(r))
      .filter((b) => b && Boolean(b.image));

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
