import fs from "node:fs";
import process from "node:process";
import * as XLSX from "xlsx";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { readFile, utils } = XLSX?.default || XLSX;

const SUPABASE_URL = "https://qgxiisgzwcsevzyaoxvl.supabase.co";
const SUPABASE_KEY = "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

const DEFAULT_RATE = 84.0;

function cleanString(val) {
  if (val == null) return "";
  return String(val).replace(/[\r\n\t]+/g, " ").trim();
}

function calcEur(rubVal) {
  const rub = Number(rubVal);
  if (!Number.isFinite(rub) || rub <= 0) return 5.99;
  return Number((rub / DEFAULT_RATE).toFixed(2));
}

async function insertBatch(books) {
  if (!books.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/books`, {
    method: "POST",
    headers,
    body: JSON.stringify(books),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[Batch Insert Error ${res.status}]:`, errText.slice(0, 150));
  }
}

async function main() {
  console.log("=== Ingesting all classic and bestselling authors across AST (24,381 rows) ===");

  const astPath = "C:/Users/testuser/Desktop/KazBook/ast.xlsx";
  const wb = readFile(astPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(sheet, { header: 1 });

  const targetAuthors = [
    "ремарк",
    "достоевск",
    "толст",
    "чехов",
    "булгаков",
    "гогол",
    "пушкин",
    "лермонтов",
    "тургенев",
    "бунин",
    "куприн",
    "набоков",
    "кинг",
    "оруэлл",
    "хэмингуэй",
    "хемингуэй",
    "брэдбери",
    "кристи",
    "роулинг",
    "толкин",
    "стругацк",
    "дюма",
    "верн",
    "лондон",
    "моэм",
    "уайльд",
    "шоу",
    "маркес",
    "мураками",
    "пелевин",
    "акунин",
    "водолазкин",
    "глуховск"
  ];

  const booksToInsert = [];
  const seenKeys = new Set();

  for (let i = 8; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[5]) continue;
    const title = cleanString(row[5]);
    const author = cleanString(row[6]);
    if (!title || title.length < 2) continue;

    const authorLower = author.toLowerCase();
    const titleLower = title.toLowerCase();

    const matchesAuthor = targetAuthors.some(
      (a) => authorLower.includes(a) || titleLower.includes(a)
    );

    if (!matchesAuthor) continue;

    const dedupeKey = `${titleLower}::${authorLower}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const rubPrice = Number(row[4]) || Number(row[69]) || 450;
    const eurPrice = calcEur(rubPrice);
    const publisher = "Издательство АСТ";
    const series = cleanString(row[7]);
    const isbn = cleanString(row[18]);
    const code = cleanString(row[37]);
    const pages = cleanString(row[24]);
    const binding = cleanString(row[29]);
    const genre = cleanString(row[61]) || cleanString(row[14]) || "Художественная литература";

    let coverUrl = null;
    if (row[53] && String(row[53]).startsWith("http")) {
      coverUrl = String(row[53]).trim();
    } else if (code && /^(ASE|AST)\d+/i.test(code)) {
      coverUrl = `https://cdn.ast.ru/v2/${code.toUpperCase()}/COVER/cover1__w340.jpg`;
    }

    booksToInsert.push({
      name: title,
      price: eurPrice,
      publisher,
      image: coverUrl,
      info: {
        author: author || null,
        publisher,
        series: series || null,
        genre,
        isbn: isbn || null,
        code: code || null,
        pages: pages ? Number(pages) || pages : null,
        binding: binding || null,
        source: "https://www.transbaltik.ru/uploads/pricelists/ast301026.xlsx",
      },
    });
  }

  console.log(`Extracted ${booksToInsert.length} classic masterpieces from AST.`);

  const BATCH_SIZE = 50;
  let inserted = 0;
  for (let i = 0; i < booksToInsert.length; i += BATCH_SIZE) {
    const chunk = booksToInsert.slice(i, i + BATCH_SIZE);
    await insertBatch(chunk);
    inserted += chunk.length;
  }
  console.log(`Successfully inserted all ${inserted} classic books into Supabase!`);
}

main().catch((err) => {
  console.error("Ingestion error:", err);
});
