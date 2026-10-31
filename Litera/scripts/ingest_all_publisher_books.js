import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
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
  console.log("=== Starting Multi-Publisher Book Ingestion (Alpina, Eksmo, AST) ===");

  const booksToInsert = [];
  const seenKeys = new Set();

  // 1. Ingest Alpina (3,300+ books)
  const alpinaPath = "C:/Users/testuser/Desktop/KazBook/alpina.xlsx";
  if (fs.existsSync(alpinaPath)) {
    console.log("Parsing Alpina catalog...");
    const wb = readFile(alpinaPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = utils.sheet_to_json(sheet, { header: 1 });
    console.log(`Alpina rows: ${rows.length}`);

    for (let i = 21; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[6]) continue;
      const title = cleanString(row[6]);
      const author = cleanString(row[5]);
      if (!title || title.length < 2) continue;

      const dedupeKey = `${title.toLowerCase()}::${author.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const rubPrice = Number(row[1]) || Number(row[2]) || 650;
      const eurPrice = calcEur(rubPrice);
      const publisher = cleanString(row[7]) || "Альпина Паблишер";
      const year = cleanString(row[9]);
      const code = cleanString(row[3]);

      booksToInsert.push({
        name: title,
        price: eurPrice,
        publisher,
        image: null,
        info: {
          author: author || null,
          publisher,
          year: year ? Number(year) || year : null,
          code: code || null,
          genre: "Нон-фикшн и классика",
          source: "https://www.transbaltik.ru/uploads/pricelists/alpina301026.xlsx",
        },
      });
    }
    console.log(`Extracted ${booksToInsert.length} unique books from Alpina.`);
  }

  // 2. Ingest Eksmo (eksmonov.xlsx)
  const eksmoPath = "C:/Users/testuser/Desktop/KazBook/eksmonov.xlsx";
  if (fs.existsSync(eksmoPath)) {
    console.log("Parsing Eksmo catalog...");
    const wb = readFile(eksmoPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = utils.sheet_to_json(sheet, { header: 1 });
    console.log(`Eksmo rows: ${rows.length}`);

    let eksmoCount = 0;
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[6]) continue;
      const title = cleanString(row[6]);
      const author = cleanString(row[7]);
      if (!title || title.length < 2) continue;

      const dedupeKey = `${title.toLowerCase()}::${author.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const rubPrice = Number(row[11]) || 500;
      const eurPrice = calcEur(rubPrice);
      const publisher = cleanString(row[1]) || "Издательство Эксмо";
      const series = cleanString(row[2]);
      const image = cleanString(row[4]) || null;
      const description = cleanString(row[5]);
      const isbn = cleanString(row[20]);
      const code = cleanString(row[21]);
      const genre = cleanString(row[14]) || cleanString(row[24]) || "Художественная литература";

      booksToInsert.push({
        name: title,
        price: eurPrice,
        publisher,
        image: image && image.startsWith("http") ? image : null,
        info: {
          author: author || null,
          publisher,
          series: series || null,
          genre,
          isbn: isbn || null,
          code: code || null,
          description: description || null,
          source: "https://www.transbaltik.ru/uploads/pricelists/eksmonov301026.xlsx",
        },
      });
      eksmoCount++;
    }
    console.log(`Extracted ${eksmoCount} books from Eksmo.`);
  }

  // 3. Ingest AST (ast.xlsx - 24,000+ books)
  // Prioritize Russian and World classics, top authors, bestsellers, and books with covers
  const astPath = "C:/Users/testuser/Desktop/KazBook/ast.xlsx";
  if (fs.existsSync(astPath)) {
    console.log("Parsing AST catalog (24,000+ rows)...");
    const wb = readFile(astPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = utils.sheet_to_json(sheet, { header: 1 });
    console.log(`AST total rows: ${rows.length}`);

    let astCount = 0;
    for (let i = 8; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[5]) continue;
      const title = cleanString(row[5]);
      const author = cleanString(row[6]);
      if (!title || title.length < 2) continue;

      const dedupeKey = `${title.toLowerCase()}::${author.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;

      // Filter: Ingest books that have an author, or are in classical/fiction/educational series, or have covers
      const hasCover = Boolean(row[53] && String(row[53]).startsWith("http"));
      const genre = cleanString(row[61]) || cleanString(row[14]);
      const isImportantGenre =
        genre.includes("Художественная") ||
        genre.includes("Классика") ||
        genre.includes("литература") ||
        genre.includes("Проза") ||
        genre.includes("Фантастика") ||
        genre.includes("Детская") ||
        genre.includes("Поэзия") ||
        genre.includes("История") ||
        genre.includes("Психология");

      const authorLower = author.toLowerCase();
      const isClassicAuthor =
        authorLower.includes("достоевск") ||
        authorLower.includes("толст") ||
        authorLower.includes("чехов") ||
        authorLower.includes("булгаков") ||
        authorLower.includes("гогол") ||
        authorLower.includes("пушкин") ||
        authorLower.includes("лермонтов") ||
        authorLower.includes("тургенев") ||
        authorLower.includes("бунин") ||
        authorLower.includes("куприн") ||
        authorLower.includes("набоков") ||
        authorLower.includes("ремарк") ||
        authorLower.includes("оруэлл") ||
        authorLower.includes("кинг") ||
        authorLower.includes("хэмингуэй") ||
        authorLower.includes("хемингуэй") ||
        authorLower.includes("брэдбери") ||
        authorLower.includes("роулинг") ||
        authorLower.includes("толкин") ||
        authorLower.includes("стругацк");

      // Ingest if classic author, or has cover, or important genre with author
      if (!isClassicAuthor && !hasCover && (!isImportantGenre || !author)) {
        continue;
      }

      seenKeys.add(dedupeKey);

      const rubPrice = Number(row[4]) || Number(row[69]) || 450;
      const eurPrice = calcEur(rubPrice);
      const publisher = "Издательство АСТ";
      const series = cleanString(row[7]);
      const isbn = cleanString(row[18]);
      const code = cleanString(row[37]);
      const pages = cleanString(row[24]);
      const binding = cleanString(row[29]);

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
          genre: genre || "Художественная литература",
          isbn: isbn || null,
          code: code || null,
          pages: pages ? Number(pages) || pages : null,
          binding: binding || null,
          source: "https://www.transbaltik.ru/uploads/pricelists/ast301026.xlsx",
        },
      });
      astCount++;

      // Cap AST batch at 3,500 curated books for fast insertion
      if (astCount >= 3500) break;
    }
    console.log(`Extracted ${astCount} classic & fiction books from AST.`);
  }

  console.log(`Total books prepared for insertion: ${booksToInsert.length}`);

  // 4. Batch insert into Supabase in chunks of 50
  const BATCH_SIZE = 50;
  let inserted = 0;
  for (let i = 0; i < booksToInsert.length; i += BATCH_SIZE) {
    const chunk = booksToInsert.slice(i, i + BATCH_SIZE);
    await insertBatch(chunk);
    inserted += chunk.length;
    if (inserted % 500 === 0 || inserted === booksToInsert.length) {
      console.log(`[Supabase Ingestion] Inserted ${inserted} / ${booksToInsert.length} books...`);
    }
  }

  console.log(`\nSuccessfully ingested ${inserted} books into Supabase books table!`);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
});
