import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as XLSX from "xlsx";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const SUPABASE_URL = "https://qgxiisgzwcsevzyaoxvl.supabase.co";
const SUPABASE_KEY = "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function syncBubbleAnnotations() {
  const xlsxPath = "c:/Users/testuser/Desktop/KazBook/bubble.xlsx";
  if (!fs.existsSync(xlsxPath)) {
    console.log("bubble.xlsx not found, skipping.");
    return;
  }

  const xlsx = XLSX?.default || XLSX;
  const wb = xlsx.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const headerRow = rows[0];

  const nameCol = headerRow.indexOf("Наименование");
  const annotCol = headerRow.indexOf("Аннотация");
  const codeCol = headerRow.indexOf("Артикул");
  const isbnCol = headerRow.indexOf("ISBN/ISSN");
  const yearCol = headerRow.indexOf("Год издания");
  const pagesCol = headerRow.indexOf("Количество страниц");
  const bindingCol = headerRow.indexOf("Тип переплета ");
  const ageCol = headerRow.indexOf("Возрастные ограничения");

  console.log(`Parsed Excel header: name=${nameCol}, annot=${annotCol}, code=${codeCol}, pages=${pagesCol}`);

  const rowMap = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const name = String(row[nameCol] || "").replace(/\r?\n+/g, " ").trim();
    if (!name) continue;
    const annot = annotCol !== -1 ? String(row[annotCol] || "").trim() : "";
    const code = codeCol !== -1 ? String(row[codeCol] || "").trim() : "";
    const isbn = isbnCol !== -1 ? String(row[isbnCol] || "").trim() : "";
    const year = yearCol !== -1 ? String(row[yearCol] || "").trim() : "";
    const pages = pagesCol !== -1 ? String(row[pagesCol] || "").trim() : "";
    const binding = bindingCol !== -1 ? String(row[bindingCol] || "").trim() : "";
    const age = ageCol !== -1 ? String(row[ageCol] || "").trim() : "";

    rowMap.set(name.toLowerCase(), { annot, code, isbn, year, pages, binding, age });
  }
  console.log(`Indexed ${rowMap.size} books from bubble.xlsx`);

  // Fetch Bubble books from Supabase
  const res = await fetch(`${SUPABASE_URL}/rest/v1/books?publisher=eq.Bubble&select=id,name,info&limit=350`, { headers });
  const books = await res.json();
  console.log(`Found ${books.length} Bubble books in Supabase`);

  let updated = 0;
  for (const b of books) {
    const key = String(b.name || "").replace(/\r?\n+/g, " ").trim().toLowerCase();
    const match = rowMap.get(key);
    if (match && (match.annot || match.pages || match.binding || match.age)) {
      const newInfo = {
        ...(b.info || {}),
        description: match.annot || b.info?.description || null,
        year: match.year || b.info?.year || null,
        pages: match.pages || null,
        binding: match.binding || null,
        age: match.age || null,
      };

      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/books?id=eq.${b.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ info: newInfo }),
      });
      if (patchRes.ok) updated++;
    }
  }
  console.log(`Successfully updated ${updated} Bubble books with full annotations and details!`);
}

syncBubbleAnnotations().catch(console.error);
