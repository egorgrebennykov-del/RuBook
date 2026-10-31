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

    const title = decodeHtmlEntities(row.name || "");
    const author = info.author ? decodeHtmlEntities(info.author) : "";
    const publisher = row.publisher || "Transbaltik";
    const year = info.year ? String(info.year).trim() : "";
    const isbn = info.isbn ? String(info.isbn).trim() : "";
    const series = info.series ? decodeHtmlEntities(info.series) : "";
    const genre = info.genre ? decodeHtmlEntities(info.genre) : "";
    const code = info.code ? String(info.code).trim() : "";
    const pages = info.pages ? String(info.pages).trim() : "";
    const binding = info.binding ? decodeHtmlEntities(info.binding) : "";
    const format = info.format ? String(info.format).trim() : "";
    const age = info.age ? String(info.age).trim() : "";

    // Generate comprehensive description if not explicitly provided
    let description = info.description ? decodeHtmlEntities(info.description).trim() : "";
    if (!description || description.length < 15) {
      const parts = [`Книга «${title}»`];
      if (author) parts.push(`авторства ${author}`);
      if (publisher) parts.push(`выпущена издательством ${publisher}`);
      if (year) parts.push(`в ${year} году`);
      if (series) parts.push(`в серии «${series}»`);
      description = `${parts.join(" ")}.`;
      if (genre) description += ` Категория / жанр: ${genre}.`;
      description += ` Издание доступно к заказу в каталоге Litera с быстрой доставкой и гарантией качества.`;
    }

    const additionalProperties = [];
    if (author) additionalProperties.push({ name: "Автор", value: author });
    if (publisher) additionalProperties.push({ name: "Издательство", value: publisher });
    if (year) additionalProperties.push({ name: "Год издания", value: year });
    if (isbn) additionalProperties.push({ name: "ISBN", value: isbn });
    if (series) additionalProperties.push({ name: "Серия", value: series });
    if (genre) additionalProperties.push({ name: "Жанр", value: genre });
    if (pages) additionalProperties.push({ name: "Количество страниц", value: pages });
    if (binding) additionalProperties.push({ name: "Переплет", value: binding });
    if (format) additionalProperties.push({ name: "Формат", value: format });
    if (age) additionalProperties.push({ name: "Возраст", value: age });

    return {
      id: row.id,
      name: title,
      title,
      price: eurPrice,
      currency: "EUR",
      description,
      descriptionHtml: `<p>${description.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`,
      mainImage: row.image ? { url: row.image } : null,
      images: row.image ? [{ url: row.image }] : [],
      image: row.image,
      publisher,
      author,
      year,
      isbn,
      code,
      series,
      genre,
      pages,
      binding,
      format,
      age,
      brand: { name: publisher },
      additionalProperties,
      url: `/book/${row.id}`,
      canonicalUrl: `/book/${row.id}`,
      availability: "InStock",
    };
  } catch (err) {
    console.warn("getBookDetails error:", err.message);
    return null;
  }
}
