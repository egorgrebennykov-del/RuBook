import dotenv from "dotenv";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { generateBookCoverSvg } from "../utils/generateBookCoverSvg.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const SUPABASE_URL = "https://qgxiisgzwcsevzyaoxvl.supabase.co";
const SUPABASE_KEY = "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function run() {
  console.log("Fetching books from Supabase...");
  // Prefer books with real images first (AST, Bubble, etc.)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?select=id,name,price,publisher,image,info&limit=2000`,
    { headers }
  );
  const allBooks = await res.json();
  console.log(`Fetched ${allBooks.length} books.`);

  // Separate books with image and books without
  const withRealImage = allBooks.filter(
    (b) => b.image && (b.image.startsWith("http://") || b.image.startsWith("https://"))
  );
  const withoutImage = allBooks.filter(
    (b) => !b.image || (!b.image.startsWith("http://") && !b.image.startsWith("https://"))
  );

  console.log(`Books with real image: ${withRealImage.length}, without: ${withoutImage.length}`);

  function formatBook(b) {
    const author = b.info?.author || "";
    const publisher = b.publisher || "";
    const series = b.info?.series || "";
    const img = (b.image && (b.image.startsWith("http://") || b.image.startsWith("https://")))
      ? b.image
      : generateBookCoverSvg({ title: b.name, author, publisher, series, id: b.id });

    return {
      id: b.id,
      title: b.name,
      url: `/book/${b.id}`,
      image: img,
      price: Number(b.price) || 12.0,
      currency: "EUR",
      publisher,
      author,
      series,
      store: "transbaltik.ru",
    };
  }

  // 1. books_on_home_page (5 standout books, all with real images if possible!)
  const homeCandidates = [...withRealImage.slice(0, 5), ...withoutImage.slice(0, 5)].slice(0, 5);
  const homeBooks = homeCandidates.map(formatBook);
  const homeRowRes = await fetch(`${SUPABASE_URL}/rest/v1/books_on_home_page?limit=1`, { headers });
  const homeRows = await homeRowRes.json();
  if (homeRows?.[0]?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/books_on_home_page?id=eq.${homeRows[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ books: homeBooks }),
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/books_on_home_page`, {
      method: "POST",
      headers,
      body: JSON.stringify({ books: homeBooks }),
    });
  }
  console.log(`Updated books_on_home_page (${homeBooks.length} books, all with images).`);

  // 2. new_books (36 books)
  const newCandidates = [...withRealImage.slice(5, 25), ...withoutImage.slice(0, 20)].slice(0, 36);
  const newBooks = newCandidates.map((b) => ({
    ...formatBook(b),
    regularPrice: null,
  }));
  const newRowRes = await fetch(`${SUPABASE_URL}/rest/v1/new_books?limit=1`, { headers });
  const newRows = await newRowRes.json();
  const newPayload = { books: { updatedAt: new Date().toISOString(), products: newBooks } };
  if (newRows?.[0]?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/new_books?id=eq.${newRows[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(newPayload),
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/new_books`, {
      method: "POST",
      headers,
      body: JSON.stringify(newPayload),
    });
  }
  console.log(`Updated new_books (${newBooks.length} books).`);

  // 3. discounts (36 books with discountPercent)
  const discountCandidates = [...withRealImage.slice(25, 45), ...withoutImage.slice(20, 40)].slice(0, 36);
  const discountBooks = discountCandidates.map((b) => {
    const formatted = formatBook(b);
    const regularPrice = Math.round(formatted.price * 1.25 * 100) / 100;
    return {
      ...formatted,
      regularPrice,
      discountPercent: 20,
    };
  });
  const discountRowRes = await fetch(`${SUPABASE_URL}/rest/v1/discounts?limit=1`, { headers });
  const discountRows = await discountRowRes.json();
  const discountPayload = { books: { updatedAt: new Date().toISOString(), products: discountBooks } };
  if (discountRows?.[0]?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/discounts?id=eq.${discountRows[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(discountPayload),
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/discounts`, {
      method: "POST",
      headers,
      body: JSON.stringify(discountPayload),
    });
  }
  console.log(`Updated discounts (${discountBooks.length} books).`);

  // 4. book_picks (36 books)
  const pickCandidates = [...withRealImage.slice(45, 65), ...withoutImage.slice(40, 60)].slice(0, 36);
  const pickBooks = pickCandidates.map(formatBook);
  const pickRowRes = await fetch(`${SUPABASE_URL}/rest/v1/book_picks?limit=1`, { headers });
  const pickRows = await pickRowRes.json();
  const pickPayload = { books: pickBooks };
  if (pickRows?.[0]?.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/book_picks?id=eq.${pickRows[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(pickPayload),
    });
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/book_picks`, {
      method: "POST",
      headers,
      body: JSON.stringify(pickPayload),
    });
  }
  console.log(`Updated book_picks (${pickBooks.length} books).`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
