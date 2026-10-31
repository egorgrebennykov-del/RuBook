import { syncTransbaltik } from "../scripts/syncTransbaltikBooks.js";

const DEFAULT_SUPABASE_URL = "https://qgxiisgzwcsevzyaoxvl.supabase.co";

function getConfig() {
  const env = globalThis.process?.env || {};
  return {
    supabaseUrl:
      env.SUPABASE_URL || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    supabaseKey:
      env.SUPABASE_SECRET_KEY ||
      env.SUPABASE_SERVICE_ROLE_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw",
  };
}

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function upsertSingleRow(table, payload, filterQuery = "select=id&limit=1") {
  const { supabaseUrl, supabaseKey } = getConfig();
  const headers = supabaseHeaders(supabaseKey);
  const lookupRes = await fetch(`${supabaseUrl}/rest/v1/${table}?${filterQuery}`, {
    headers,
  });
  const rows = lookupRes.ok ? await lookupRes.json().catch(() => []) : [];
  const existingId = rows?.[0]?.id;

  const targetUrl = existingId
    ? `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(existingId)}`
    : `${supabaseUrl}/rest/v1/${table}`;
  const method = existingId ? "PATCH" : "POST";

  const saveRes = await fetch(targetUrl, {
    method,
    headers,
    body: JSON.stringify(payload),
  });
  if (!saveRes.ok) {
    const errText = await saveRes.text().catch(() => "");
    throw new Error(`Supabase ${table} error (${saveRes.status}): ${errText}`);
  }
  return saveRes.json().catch(() => []);
}

async function fetchBooksFromDb(limit = 40, order = "id.desc") {
  const { supabaseUrl, supabaseKey } = getConfig();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/books?select=id,name,price,publisher,image,info&order=${order}&limit=${limit}`,
    { headers: supabaseHeaders(supabaseKey) }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch books: ${res.status}`);
  }
  return await res.json();
}

export async function runUpdateExchangeRate() {
  let rate = 84.0;
  let rateDate = new Date().toISOString().slice(0, 10);

  try {
    const res = await fetch("https://www.transbaltik.ru/pricelists");
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/КУРС\s*EUR\/RUB:\s*([\d.,]+)/i);
      if (match && match[1]) {
        const parsed = Number(match[1].replace(",", "."));
        if (Number.isFinite(parsed) && parsed > 0) {
          rate = parsed;
        }
      }
    }
  } catch {
    // fallback to 84.0
  }

  await upsertSingleRow(
    "exchange_rate",
    {
      base_currency: "EUR",
      quote_currency: "RUB",
      rate,
      rate_date: rateDate,
      updated_at: new Date().toISOString(),
    },
    "select=id&base_currency=eq.EUR&quote_currency=eq.RUB&limit=1"
  );

  return `Updated EUR/RUB exchange rate: ${rate} (${rateDate})`;
}

export async function runUpdateDiscounts() {
  const books = await fetchBooksFromDb(36, "id.desc");
  if (!books || books.length === 0) {
    throw new Error("No books in Supabase to create discounts from");
  }

  const discountedBooks = books.map((b) => {
    const price = Number(b.price) || 12.0;
    const regularPrice = Math.round(price * 1.25 * 100) / 100;
    return {
      id: b.id,
      title: b.name,
      url: `/book/${b.id}`,
      image: b.image || "",
      price,
      regularPrice,
      currency: "EUR",
      publisher: b.publisher || "",
      author: b.info?.author || "",
      store: "transbaltik.ru",
      discountPercent: 20,
    };
  });

  await upsertSingleRow("discounts", {
    books: {
      updatedAt: new Date().toISOString(),
      products: discountedBooks,
    },
  });

  return `Saved ${discountedBooks.length} discounted books to Supabase`;
}

export async function runUpdateNewBooks() {
  const books = await fetchBooksFromDb(36, "id.desc");
  if (!books || books.length === 0) {
    throw new Error("No books in Supabase to create new books from");
  }

  const newBooks = books.map((b) => ({
    id: b.id,
    title: b.name,
    url: `/book/${b.id}`,
    image: b.image || "",
    price: Number(b.price) || 0,
    regularPrice: null,
    currency: "EUR",
    author: b.info?.author || "",
    publisher: b.publisher || "",
    store: "transbaltik.ru",
  }));

  await upsertSingleRow("new_books", {
    books: {
      updatedAt: new Date().toISOString(),
      products: newBooks,
    },
  });

  return `Saved ${newBooks.length} new books to Supabase`;
}

export async function runUpdateBookPicks() {
  const books = await fetchBooksFromDb(36, "id.asc");
  if (!books || books.length === 0) {
    throw new Error("No books in Supabase to create book picks from");
  }

  const picks = books.map((b) => ({
    id: b.id,
    title: b.name,
    url: `/book/${b.id}`,
    image: b.image || "",
    price: Number(b.price) || 0,
    currency: "EUR",
    author: b.info?.author || "",
    publisher: b.publisher || "",
    store: "transbaltik.ru",
  }));

  await upsertSingleRow("book_picks", { books: picks });
  return `Saved ${picks.length} book picks to Supabase`;
}

export async function runUpdateHomepageBooks() {
  const books = await fetchBooksFromDb(10, "id.desc");
  if (!books || books.length === 0) {
    throw new Error("No books in Supabase for homepage");
  }

  const selected = books.slice(0, 5).map((b) => ({
    id: b.id,
    title: b.name,
    url: `/book/${b.id}`,
    image: b.image || "",
    price: Number(b.price) || 0,
    currency: "EUR",
    publisher: b.publisher || "",
    author: b.info?.author || "",
    store: "transbaltik.ru",
  }));

  await upsertSingleRow("books_on_home_page", { books: selected });
  return `Saved ${selected.length} homepage books to Supabase`;
}

export async function executeCatalogActionById(actionId) {
  switch (actionId) {
    case "sync-transbaltik-books":
      return await syncTransbaltik();
    case "update-exchange-rate":
      return await runUpdateExchangeRate();
    case "update-discounts":
      return await runUpdateDiscounts();
    case "update-new-books":
      return await runUpdateNewBooks();
    case "update-book-picks":
      return await runUpdateBookPicks();
    case "update-home-books":
      return await runUpdateHomepageBooks();
    default:
      throw new Error(`Unknown action: ${actionId}`);
  }
}
