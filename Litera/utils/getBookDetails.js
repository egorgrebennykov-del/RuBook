import decodeHtmlEntities from "./decodeHtmlEntities.js";
import getExchangeRate, { DEFAULT_RATE, getCachedExchangeRate } from "./getExchangeRate.js";

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

export default async function getBookDetails(idOrUrl) {
  if (!idOrUrl) return null;
  const rate = getCachedExchangeRate() || DEFAULT_RATE;

  // Check if numeric ID or URL with ID (e.g. /book/123 or "123")
  const idMatch = String(idOrUrl).match(/(?:^|\/book\/)(\d+)(?:$|[?#])/);
  const bookId = idMatch ? idMatch[1] : null;

  try {
    let url = `${TABLE_URL}?select=id,name,price,publisher,image,info&limit=1`;
    if (bookId) {
      url = `${TABLE_URL}?select=id,name,price,publisher,image,info&id=eq.${bookId}&limit=1`;
    } else {
      const cleanName = encodeURIComponent(String(idOrUrl).trim());
      url = `${TABLE_URL}?select=id,name,price,publisher,image,info&name=ilike.*${cleanName}*&limit=1`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;

    const row = rows[0];
    const info = row.info || {};
    const eurPrice = Number(row.price) > 0 ? Number(row.price) : 5.99;
    const rubPrice = Number(info.price_rub) > 0 ? Number(info.price_rub) : Math.round(eurPrice * rate);

    const additionalProperties = [];
    if (info.author) additionalProperties.push({ name: "Автор", value: info.author });
    if (row.publisher) additionalProperties.push({ name: "Издательство", value: row.publisher });
    if (info.year) additionalProperties.push({ name: "Год издания", value: info.year });
    if (info.isbn) additionalProperties.push({ name: "ISBN", value: info.isbn });
    if (info.series) additionalProperties.push({ name: "Серия", value: info.series });
    if (info.genre) additionalProperties.push({ name: "Жанр / Категория", value: info.genre });
    if (info.code) additionalProperties.push({ name: "Артикул / Код", value: info.code });
    if (rubPrice) additionalProperties.push({ name: "Цена в рублях", value: `${rubPrice} ₽` });

    return {
      id: row.id,
      name: decodeHtmlEntities(row.name || ""),
      title: decodeHtmlEntities(row.name || ""),
      price: eurPrice,
      currency: "EUR",
      price_rub: rubPrice,
      description: info.description || `Книга «${row.name}» от издательства ${row.publisher || 'Transbaltik'}. Доступна к заказу в магазине Litera.`,
      descriptionHtml: `<p>${info.description || `Книга «${row.name}» от издательства ${row.publisher || 'Transbaltik'}.`}</p>`,
      mainImage: row.image ? { url: row.image } : null,
      images: row.image ? [{ url: row.image }] : [],
      publisher: row.publisher,
      author: info.author || "",
      isbn: info.isbn || "",
      brand: { name: row.publisher || "Transbaltik" },
      additionalProperties,
      url: `/book/${row.id}`,
      canonicalUrl: `/book/${row.id}`,
    };
  } catch (err) {
    console.warn("getBookDetails error:", err.message);
    return null;
  }
}
