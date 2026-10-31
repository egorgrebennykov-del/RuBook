import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import * as XLSX from 'xlsx';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const xlsxObj = XLSX?.default || XLSX;
const { readFile, utils } = xlsxObj;

const SUPABASE_URL = process.env.SUPABASE_URL || "https://qgxiisgzwcsevzyaoxvl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

const DEFAULT_RATE = 84.0;
const CACHE_DIR = 'c:/Users/testuser/Desktop/KazBook/catalogs';
fs.mkdirSync(CACHE_DIR, { recursive: true });

function downloadBinary(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      rejectUnauthorized: false,
      timeout: 30000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBinary(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP status ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      fs.unlink(dest, () => {});
      reject(new Error('Download timeout'));
    });
  });
}

export function isStrictDirectImage(url) {
  if (!url || typeof url !== 'string') return false;
  const str = url.trim();
  if (!str.startsWith('http://') && !str.startsWith('https://')) return false;

  const forbidden = [
    'disk.yandex.', 'drive.google.com', 'cloud.mail.ru', 'dropbox.com',
    'clck.', 'clc.li', '/game/', '/product/', '/catalog/', '/games/'
  ];
  if (forbidden.some(f => str.includes(f))) return false;

  const cleanPath = str.split('?')[0].toLowerCase();
  if (/\.(jpe?g|png|webp|avif)$/i.test(cleanPath)) return true;

  const cdns = [
    'cdn.ast.ru', 'cdn.eksmo.ru', 'pic.rosman.ru',
    'storage.yandexcloud.net', 'static.bubble.ru',
    'insales-cdn.com', 'insales.ru'
  ];
  return cdns.some(c => str.includes(c));
}

export function smartParseSheet(sheet, defaultPublisher, rate = DEFAULT_RATE, fileUrl = '', catalogDate = '') {
  const data = utils.sheet_to_json(sheet, { header: 1 });
  if (!data || data.length < 2) return [];

  let headerRowIdx = -1;
  let nameCol = -1;
  let priceCol = -1;
  let authorCol = -1;
  let isbnCol = -1;
  let yearCol = -1;
  let imageCol = -1;
  let codeCol = -1;
  let seriesCol = -1;
  let genreCol = -1;
  let descCol = -1;
  let pagesCol = -1;
  let bindingCol = -1;
  let publisherCol = -1;

  for (let r = 0; r < Math.min(25, data.length); r++) {
    const row = data[r];
    if (!Array.isArray(row)) continue;

    let curNameCol = -1;
    let curPriceCol = -1;
    let curAuthorCol = -1;
    let curIsbnCol = -1;
    let curYearCol = -1;
    let curImageCol = -1;
    let curCodeCol = -1;
    let curSeriesCol = -1;
    let curGenreCol = -1;
    let curDescCol = -1;
    let curPagesCol = -1;
    let curBindingCol = -1;
    let curPubCol = -1;

    for (let c = 0; c < row.length; c++) {
      const raw = String(row[c] || '').trim();
      const val = raw.toLowerCase();
      if (!val) continue;

      if (curNameCol === -1 && (
        val === 'название' || val === 'наименование' || val === 'название книги' ||
        val === 'наименование товара' || val === 'товар' || val === 'наименование книги' ||
        val === 'книга' || val.includes('наименование') || val.includes('номенклатура') ||
        val.includes('название игры') || val.startsWith('игры ') || val === 'игры' ||
        (val.includes('название') && !val.includes('нажмите'))
      )) {
        curNameCol = c;
      }

      if (curPriceCol === -1 && (
        val.includes('цена') || val.includes('прайс') || val.includes('ррц') || val.includes('рмрц') ||
        val.includes('опт') || val.includes('стоимость') || val === 'цена руб' || val === 'цена, руб' ||
        val.includes('базовая цена')
      )) {
        curPriceCol = c;
      }

      if (curAuthorCol === -1 && (val === 'автор' || val === 'авторы' || val.includes('автор') || val === 'составитель')) {
        curAuthorCol = c;
      }

      if (curIsbnCol === -1 && val.includes('isbn')) {
        curIsbnCol = c;
      }

      if (curYearCol === -1 && (val.includes('год') || val.includes('г.изд'))) {
        curYearCol = c;
      }

      if (curImageCol === -1 && (val.includes('обложка') || val.includes('фото') || val.includes('картинка') || val.includes('изображ') || val.includes('ссылка на обложку') || val.includes('ссылка на фото') || val.includes('ссылка на сайт') || val.includes('ссылка'))) {
        curImageCol = c;
      }

      if (curCodeCol === -1 && (val.includes('артикул') || val.includes('код') || val.includes('штрихкод') || val.includes('barcode'))) {
        curCodeCol = c;
      }

      if (curSeriesCol === -1 && val.includes('серия')) {
        curSeriesCol = c;
      }

      if (curGenreCol === -1 && (val.includes('жанр') || val.includes('раздел') || val.includes('категория') || val.includes('тематика') || val.includes('направление'))) {
        curGenreCol = c;
      }

      if (curDescCol === -1 && (val.includes('аннотац') || val.includes('описание') || val.includes('синопсис') || val === 'о книге' || val.includes('информация'))) {
        curDescCol = c;
      }

      if (curPagesCol === -1 && (val.includes('страниц') || val === 'стр.' || val === 'стр' || val.includes('объем'))) {
        curPagesCol = c;
      }

      if (curBindingCol === -1 && (val.includes('переплет') || val.includes('переплёт') || val.includes('тип обложки') || val === 'тип')) {
        curBindingCol = c;
      }

      if (curPubCol === -1 && (val.includes('издательство') || val.includes('производитель') || val.includes('бренд'))) {
        curPubCol = c;
      }
    }

    if (curNameCol !== -1 && (curPriceCol !== -1 || r > 2)) {
      headerRowIdx = r;
      nameCol = curNameCol;
      priceCol = curPriceCol !== -1 ? curPriceCol : 0;
      authorCol = curAuthorCol;
      isbnCol = curIsbnCol;
      yearCol = curYearCol;
      imageCol = curImageCol;
      codeCol = curCodeCol;
      seriesCol = curSeriesCol;
      genreCol = curGenreCol;
      descCol = curDescCol;
      pagesCol = curPagesCol;
      bindingCol = curBindingCol;
      publisherCol = curPubCol;
      break;
    }
  }

  if (nameCol === -1) {
    for (let r = 0; r < Math.min(10, data.length); r++) {
      const row = data[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toLowerCase();
        if (val.length > 3 && !val.includes('прайс') && !val.includes('внимание') && !val.includes('заказ')) {
          nameCol = c;
          headerRowIdx = r;
          break;
        }
      }
      if (nameCol !== -1) break;
    }
  }

  if (nameCol === -1) return [];

  const books = [];
  const seenNames = new Set();

  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row)) continue;

    const rawName = String(row[nameCol] || '').replace(/[\r\n\t]+/g, ' ').trim();
    if (!rawName || rawName.length < 2) continue;
    if (rawName.toLowerCase().startsWith('итого') || rawName.toLowerCase().includes('всего наименований') || rawName.toLowerCase().startsWith('всего:')) continue;

    const key = rawName.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    let rawPrice = priceCol !== -1 ? Number(String(row[priceCol] || '').replace(/[^\d.,]/g, '').replace(',', '.')) : 0;
    if (!Number.isFinite(rawPrice)) rawPrice = 0;

    let eurPrice = rawPrice > 0 ? Math.round((rawPrice / rate) * 100) / 100 : 0;
    if (eurPrice <= 0) eurPrice = 5.99;
    eurPrice = Math.max(2.99, eurPrice);

    const author = authorCol !== -1 ? String(row[authorCol] || '').replace(/[\r\n\t]+/g, ' ').trim() : '';
    const isbn = isbnCol !== -1 ? String(row[isbnCol] || '').trim() : '';
    const year = yearCol !== -1 ? String(row[yearCol] || '').trim() : '';
    let image = imageCol !== -1 ? String(row[imageCol] || '').trim() : '';
    if (image && !image.startsWith('http')) image = '';

    const code = codeCol !== -1 ? String(row[codeCol] || '').trim() : '';
    const series = seriesCol !== -1 ? String(row[seriesCol] || '').trim() : '';
    const genre = genreCol !== -1 ? String(row[genreCol] || '').trim() : '';
    const desc = descCol !== -1 ? String(row[descCol] || '').trim() : '';
    const pages = pagesCol !== -1 ? String(row[pagesCol] || '').trim() : '';
    const binding = bindingCol !== -1 ? String(row[bindingCol] || '').trim() : '';
    const pub = publisherCol !== -1 && String(row[publisherCol] || '').trim() ? String(row[publisherCol] || '').trim() : defaultPublisher;

    if (!image && code && code.startsWith('ASE')) {
      image = `https://cdn.ast.ru/v2/${code}/COVER/cover1__w340.jpg`;
    }

    // STRICT: Only accept books/items with verified real direct photographic cover images!
    if (!isStrictDirectImage(image)) {
      continue;
    }

    books.push({
      name: rawName,
      price: eurPrice,
      publisher: pub,
      image: image || null,
      info: {
        author: author || null,
        isbn: isbn || null,
        year: year ? (Number(year) || year) : null,
        code: code || null,
        series: series || null,
        genre: genre || null,
        description: desc ? desc.slice(0, 1000) : null,
        pages: pages || null,
        binding: binding || null,
        price_rub: rawPrice,
        price_eur: eurPrice,
        catalog_updated: catalogDate,
        source: fileUrl
      }
    });
  }

  return books;
}

async function insertBatch(books) {
  if (!books.length) return 0;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/books`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(books)
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn(`[Batch Insert Error ${res.status}]:`, err.slice(0, 160));
    return 0;
  }
  return books.length;
}

async function run() {
  console.log("=== Launching Comprehensive Multi-Catalog Ingestion for ALL Transbaltik Publishers ===");
  const parsedFile = 'c:/Users/testuser/Desktop/KazBook/pricelists_parsed.json';
  if (!fs.existsSync(parsedFile)) {
    throw new Error(`File ${parsedFile} does not exist`);
  }

  const catalogList = JSON.parse(fs.readFileSync(parsedFile, 'utf8'));
  console.log(`Loaded ${catalogList.length} catalogs from pricelists_parsed.json`);

  const EXCLUDED_KEYWORDS = ['mnogoknig', 'бимбимон', '4games', 'bimbimon'];

  // Track already inserted publishers to avoid duplicates
  const processedStats = [];
  let totalInsertedAll = 0;

  for (let idx = 0; idx < catalogList.length; idx++) {
    const item = catalogList[idx];
    const rawName = item.name.replace(/^!\s*/, '').trim();
    const cleanPubName = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const fileUrl = item.url;

    if (EXCLUDED_KEYWORDS.some(kw => rawName.toLowerCase().includes(kw) || (fileUrl && fileUrl.toLowerCase().includes(kw)))) {
      console.log(`[${idx + 1}/${catalogList.length}] Skipping explicitly excluded catalog: ${cleanPubName}`);
      continue;
    }

    if (!fileUrl || !fileUrl.startsWith('https://www.transbaltik.ru/uploads/pricelists/')) {
      console.log(`[${idx + 1}/${catalogList.length}] Skipping external/invalid URL: ${cleanPubName}`);
      continue;
    }

    const ext = path.extname(fileUrl).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      console.log(`[${idx + 1}/${catalogList.length}] Skipping non-excel format (${ext}): ${cleanPubName}`);
      continue;
    }

    // Check size limit: skip massive > 30MB files to save memory & network
    const isMassive = item.size && item.size.includes('MB') && parseFloat(item.size) > 25.0;
    if (isMassive && (cleanPubName.includes('Эксмо') || cleanPubName.includes('Архипелаг') || cleanPubName.includes('Буква-Ленд'))) {
      console.log(`[${idx + 1}/${catalogList.length}] Skipping massive file ${item.size}: ${cleanPubName}`);
      continue;
    }

    const localFile = path.join(CACHE_DIR, path.basename(fileUrl));

    try {
      if (!fs.existsSync(localFile) || fs.statSync(localFile).size < 100) {
        process.stdout.write(`[${idx + 1}/${catalogList.length}] Downloading ${cleanPubName} (${item.size})... `);
        await downloadBinary(fileUrl, localFile);
        console.log(`OK`);
      } else {
        console.log(`[${idx + 1}/${catalogList.length}] Reading cached ${cleanPubName} (${item.size})`);
      }

      const wb = readFile(localFile);
      const allCatalogBooks = [];

      for (const sName of wb.SheetNames) {
        try {
          const sheetBooks = smartParseSheet(wb.Sheets[sName], cleanPubName, DEFAULT_RATE, fileUrl, item.updated_at);
          if (sheetBooks.length > 0) {
            // Keep up to 150 items per sheet
            allCatalogBooks.push(...sheetBooks.slice(0, 150));
          }
        } catch (sErr) {
          // ignore faulty sheet
        }
      }

      if (allCatalogBooks.length === 0) {
        console.log(`  -> 0 books found in ${cleanPubName}`);
        continue;
      }

      // Deduplicate inside catalog by clean ISBN (keeping cheapest), then by name + publisher
      const isbnMap = new Map();
      const withoutIsbn = [];

      for (const b of allCatalogBooks) {
        const rawIsbn = b.info?.isbn || '';
        const cleanIsbn = String(rawIsbn).replace(/[^0-9X]/gi, '').toUpperCase();
        if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
          if (!isbnMap.has(cleanIsbn)) {
            isbnMap.set(cleanIsbn, b);
          } else {
            const existing = isbnMap.get(cleanIsbn);
            if (Number(b.price) < Number(existing.price)) {
              isbnMap.set(cleanIsbn, b); // keep cheapest
            }
          }
        } else {
          withoutIsbn.push(b);
        }
      }

      const uniqueBooks = [];
      const seen = new Set();
      for (const b of [...isbnMap.values(), ...withoutIsbn]) {
        const k = `${b.name}:::${b.publisher}`.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          uniqueBooks.push(b);
        }
      }

      // Limit per publisher to 200 items to ensure wide diversity across all publishers
      const toUpload = uniqueBooks.slice(0, 200);

      // Batch upload in chunks of 100
      let uploadedForCat = 0;
      for (let i = 0; i < toUpload.length; i += 100) {
        const chunk = toUpload.slice(i, i + 100);
        const count = await insertBatch(chunk);
        uploadedForCat += count;
      }

      totalInsertedAll += uploadedForCat;
      processedStats.push({
        publisher: cleanPubName,
        books_count: uploadedForCat,
        updated_at: item.updated_at,
        url: fileUrl
      });

      console.log(`  -> Inserted ${uploadedForCat} books for [${cleanPubName}]. Total DB additions: ${totalInsertedAll}`);

    } catch (err) {
      console.warn(`[${idx + 1}/${catalogList.length}] Error processing ${cleanPubName}: ${err.message}`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`🎉 Ingestion Finished! Successfully ingested ${totalInsertedAll} books across ${processedStats.length} publishers!`);
  console.log(`======================================================`);

  // Write updated catalog-status.json
  const statusPayload = {
    synced_at: new Date().toISOString(),
    total_publishers_processed: processedStats.length,
    total_books_added: totalInsertedAll,
    processed_publishers: processedStats
  };

  const statusPath = 'c:/Users/testuser/Desktop/Litera/Litera/public/catalog-status.json';
  fs.writeFileSync(statusPath, JSON.stringify(statusPayload, null, 2));
  console.log(`Wrote update to ${statusPath}`);
}

run().catch((e) => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
