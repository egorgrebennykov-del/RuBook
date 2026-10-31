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

async function updateDiscounts() {
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

  const discountedBooks = books.map((b) => {
    const price = Number(b.price) || 10;
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

  const { data: row, error: lookupError } = await supabase
    .from("discounts")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  const payload = {
    books: {
      updatedAt: new Date().toISOString(),
      products: discountedBooks,
    },
  };

  const result = row
    ? await supabase.from("discounts").update(payload).eq("id", row.id)
    : await supabase.from("discounts").insert(payload);

  if (result.error) throw result.error;
  console.log(`Saved ${discountedBooks.length} discounted books to Supabase discounts table (EUR).`);
}

updateDiscounts().catch((err) => {
  console.error("Failed to update discounts:", err.message);
  process.exitCode = 1;
});
