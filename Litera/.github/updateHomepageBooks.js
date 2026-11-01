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

const TARGET_PUBLISHERS = [
  { key: "alpina", name: "Альпина", pattern: /альпин/i, filter: (query) => query.ilike("publisher", "%Альпин%") },
  { key: "ast", name: "АСТ", pattern: /(?:^|[^а-яёa-z0-9])аст(?:[^а-яёa-z0-9]|$)|издательство\s*аст/i, filter: (query) => query.ilike("publisher", "%АСТ%") },
  { key: "eksmo", name: "Эксмо", pattern: /эксмо/i, filter: (query) => query.ilike("publisher", "%Эксмо%") },
  { key: "mif", name: "МИФ", pattern: /(?:^|[^а-яёa-z0-9])миф(?:[^а-яёa-z0-9]|$)|манн[,\s]+иванов/i, filter: (query) => query.ilike("publisher", "%МИФ%") },
  { key: "popuri", name: "Попурри", pattern: /попурри/i, filter: (query) => query.ilike("publisher", "%Попурри%") },
];

function hasValidImageUrl(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== "string") return false;
  const str = sourceUrl.trim();
  if (str.startsWith("/") || str.startsWith("data:image/")) return true;
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

async function updateHomepageBooks() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  const selected = [];

  for (const pub of TARGET_PUBLISHERS) {
    let query = supabase
      .from("books")
      .select("id, name, price, publisher, image, info")
      .not("image", "is", null);

    query = pub.filter(query);

    const { data: books, error: fetchErr } = await query.limit(20);
    if (fetchErr) {
      console.warn(`Error fetching for ${pub.name}:`, fetchErr.message);
      continue;
    }

    const candidate = (books || []).find((b) => b.image && hasValidImageUrl(b.image));
    if (candidate) {
      selected.push({
        id: candidate.id,
        title: candidate.name,
        url: `/book/${candidate.id}`,
        image: candidate.image,
        price: Number(candidate.price) || 5.99,
        currency: "EUR",
        publisher: pub.name,
        author: candidate.info?.author || "",
        store: pub.name,
      });
    }
  }

  if (selected.length === 0) {
    console.warn("No books found for target publishers");
    return;
  }

  const { data: row, error: lookupError } = await supabase
    .from("books_on_home_page")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  const payload = { books: selected };

  const result = row
    ? await supabase.from("books_on_home_page").update(payload).eq("id", row.id)
    : await supabase.from("books_on_home_page").insert(payload);

  if (result.error) throw result.error;
  console.log(`Saved ${selected.length} homepage books (from ${selected.map(b => b.publisher).join(", ")}) to books_on_home_page.`);
}

updateHomepageBooks().catch((err) => {
  console.error("Failed to update homepage books:", err.message);
  process.exitCode = 1;
});
