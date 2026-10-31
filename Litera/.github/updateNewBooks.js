import dotenv from "dotenv";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://qgxiisgzwcsevzyaoxvl.supabase.co";
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

async function updateNewBooks() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  const { data: books, error: fetchErr } = await supabase
    .from("books")
    .select("id, name, price, publisher, image, info")
    .order("id", { ascending: false })
    .limit(36);

  if (fetchErr) throw fetchErr;
  if (!books || books.length === 0) {
    console.warn("No books found in Supabase books table");
    return;
  }

  const newBooks = books.map((b) => ({
    id: b.id,
    title: b.name,
    url: `/book/${b.id}`,
    image: b.image || "",
    price: Number(b.price) || 0,
    regularPrice: null,
    currency: "EUR",
    publisher: b.publisher || "",
    author: b.info?.author || "",
    store: "transbaltik.ru",
  }));

  const { data: row, error: lookupError } = await supabase
    .from("new_books")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  const payload = {
    books: {
      updatedAt: new Date().toISOString(),
      products: newBooks,
    },
  };

  const result = row
    ? await supabase.from("new_books").update(payload).eq("id", row.id)
    : await supabase.from("new_books").insert(payload);

  if (result.error) throw result.error;
  console.log(`Saved ${newBooks.length} new books to Supabase new_books table (EUR).`);
}

updateNewBooks().catch((err) => {
  console.error("Failed to update new books:", err.message);
  process.exitCode = 1;
});
