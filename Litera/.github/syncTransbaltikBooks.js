import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const xlsxObj = XLSX?.default || XLSX;
const { readFile, utils } = xlsxObj;

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://qgxiisgzwcsevzyaoxvl.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_b9UI3PiZhUvPTcroS9oMOg_NyHBwtxw";

const DEFAULT_RATE = 84.0;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      rejectUnauthorized: false
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

function downloadBinary(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBinary(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function updateExchangeRateInDb(rate) {
  console.log(`[Sync] Updating exchange rate in Supabase: EUR/RUB = ${rate}`);
  try {
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/exchange_rate?limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const rows = checkRes.ok ? await checkRes.json() : [];
    const payload = {
      base_currency: 'EUR',
      quote_currency: 'RUB',
      rate,
      rate_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    };

    if (rows && rows.length > 0 && rows[0].id) {
      await fetch(`${SUPABASE_URL}/rest/v1/exchange_rate?id=eq.${rows[0].id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/exchange_rate`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    }
  } catch (err) {
    console.warn('[Sync] Could not update exchange rate in DB:', err.message);
  }
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

// Universal parser for any book pricelist sheet
export function parseSheetToBooks(sheet, publisherName = '', rate = DEFAULT_RATE, fileUrl = '', catalogUpdated = '') {
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
  let formatCol = -1;
  let ageCol = -1;

  for (let r = 0; r < Math.min(25, data.length); r++) {
    const row = data[r];
    if (!Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim().toLowerCase();
      if (!val) continue;

      if (nameCol === -1 && (
        val === 'название' || val === 'наименование' || val === 'название книги' ||
        val === 'наименование товара' || val === 'товар' || val === 'наименование книги' ||
        val === 'книга' || val.includes('наименование оригинал') || val.includes('наименование книги') ||
        val.includes('номенклатура') || val.includes('название игры') || val.startsWith('игры ') || val === 'игры' ||
        (val.includes('наименование') && !val.includes('фирм') && !val.includes('организац')) ||
        (val.includes('название') && !val.includes('нажмите') && !val.includes('фирм'))
      )) {
        nameCol = c;
      }
      if (priceCol === -1 && (
        val.includes('цена') || val.includes('прайс') || val.includes('ррц') || val.includes('рмрц') ||
        val.includes('опт') || val.includes('стоимость') || val === 'цена руб' || val === 'цена, руб' ||
        val.includes('базовая цена')
      )) {
        priceCol = c;
      }
      if (authorCol === -1 && (val === 'автор' || val === 'авторы' || val.includes('автор'))) {
        authorCol = c;
      }
      if (isbnCol === -1 && val.includes('isbn')) {
        isbnCol = c;
      }
      if (yearCol === -1 && (val.includes('год') || val.includes('год изд'))) {
        yearCol = c;
      }
      if (imageCol === -1 && (val.includes('обложка') || val.includes('фото') || val.includes('картинка') || val.includes('изображ') || val.includes('ссылка на обложку') || val.includes('ссылка на фото'))) {
        imageCol = c;
      }
      if (codeCol === -1 && (val.includes('артикул') || val.includes('код') || val.includes('штрихкод') || val.includes('barcode'))) {
        codeCol = c;
      }
      if (seriesCol === -1 && val.includes('серия')) {
        seriesCol = c;
      }
      if (genreCol === -1 && (val.includes('жанр') || val.includes('раздел') || val.includes('категория') || val.includes('тематика'))) {
        genreCol = c;
      }
      if (descCol === -1 && (val.includes('аннотац') || val.includes('описание') || val.includes('синопсис') || val === 'о книге')) {
        descCol = c;
      }
      if (pagesCol === -1 && (val.includes('страниц') || val === 'стр.' || val === 'стр' || val.includes('объем'))) {
        pagesCol = c;
      }
      if (bindingCol === -1 && (val.includes('переплет') || val.includes('переплёт') || val.includes('тип обложки'))) {
        bindingCol = c;
      }
      if (formatCol === -1 && (val.includes('формат') || val.includes('размер'))) {
        formatCol = c;
      }
      if (ageCol === -1 && (val.includes('возраст') || val.includes('ограничен'))) {
        ageCol = c;
      }
    }

    if (nameCol !== -1 && (priceCol !== -1 || r > 5)) {
      headerRowIdx = r;
      break;
    }
  }

  if (nameCol === -1) return [];

  const books = [];
  const seenNames = new Set();

  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row)) continue;

    const rawName = String(row[nameCol] || '').replace(/\r?\n+/g, ' ').trim();
    if (!rawName || rawName.length < 2) continue;
    if (rawName.toLowerCase().includes('всего наименований') || rawName.toLowerCase().startsWith('итого')) continue;

    const nameKey = rawName.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);

    let rawPrice = priceCol !== -1 ? Number(String(row[priceCol] || '').replace(/[^\d.,]/g, '').replace(',', '.')) : 0;
    if (!Number.isFinite(rawPrice)) rawPrice = 0;

    const eurPrice = rawPrice > 0 ? Math.round((rawPrice / rate) * 100) / 100 : 0;
    const author = authorCol !== -1 ? String(row[authorCol] || '').replace(/\r?\n+/g, ' ').trim() : '';
    const isbn = isbnCol !== -1 ? String(row[isbnCol] || '').trim() : '';
    const year = yearCol !== -1 ? String(row[yearCol] || '').trim() : '';
    let image = imageCol !== -1 ? String(row[imageCol] || '').trim() : '';
    if (image && !image.startsWith('http')) image = '';

    const code = codeCol !== -1 ? String(row[codeCol] || '').trim() : '';
    const series = seriesCol !== -1 ? String(row[seriesCol] || '').trim() : '';
    const genre = genreCol !== -1 ? String(row[genreCol] || '').trim() : '';
    const description = descCol !== -1 ? String(row[descCol] || '').trim() : '';
    const pages = pagesCol !== -1 ? String(row[pagesCol] || '').trim() : '';
    const binding = bindingCol !== -1 ? String(row[bindingCol] || '').trim() : '';
    const format = formatCol !== -1 ? String(row[formatCol] || '').trim() : '';
    const age = ageCol !== -1 ? String(row[ageCol] || '').trim() : '';

    if (!image && code && code.startsWith('ASE')) {
      image = `https://cdn.ast.ru/v2/${code}/COVER/cover1__w340.jpg`;
    } else if (image && image.includes('go.ast.ru') && code) {
      image = `https://cdn.ast.ru/v2/${code}/COVER/cover1__w340.jpg`;
    }

    // STRICT: Only accept books/items with verified real direct photographic cover images!
    if (!isStrictDirectImage(image)) {
      continue;
    }

    books.push({
      name: rawName,
      price: eurPrice > 0 ? eurPrice : (rawPrice > 0 ? Math.round((rawPrice / 84) * 100) / 100 : 5.99),
      publisher: publisherName,
      image: image || null,
      info: {
        author: author || null,
        isbn: isbn || null,
        year: year || null,
        code: code || null,
        series: series || null,
        genre: genre || null,
        description: description || null,
        pages: pages || null,
        binding: binding || null,
        format: format || null,
        age: age || null,
        price_rub: rawPrice,
        price_eur: eurPrice,
        rate,
        catalog_updated: catalogUpdated,
        source: fileUrl
      }
    });
  }

  return books;
}

export async function syncTransbaltik() {
  console.log('[Sync] Starting Transbaltik catalog synchronization...');
  const tmpDir = path.join(process.cwd(), '.cache', 'transbaltik');
  fs.mkdirSync(tmpDir, { recursive: true });

  // 1. Fetch pricelists page
  const pageRes = await fetchUrl('https://www.transbaltik.ru/pricelists');
  if (pageRes.status !== 200 || !pageRes.data) {
    throw new Error(`Failed to load transbaltik.ru/pricelists (status ${pageRes.status})`);
  }

  // 2. Extract EUR/RUB exchange rate
  let currentRate = DEFAULT_RATE;
  const rateMatch = pageRes.data.match(/КУРС\s*EUR\/RUB:\s*([\d.,]+)/i);
  if (rateMatch && rateMatch[1]) {
    const parsed = Number(rateMatch[1].replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      currentRate = parsed;
    }
  }
  console.log(`[Sync] Detected EUR/RUB rate from site: ${currentRate}`);
  await updateExchangeRateInDb(currentRate);

  // 3. Parse table rows
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
  const pricelists = [];
  let match;
  while ((match = rowRegex.exec(pageRes.data)) !== null) {
    const rowHtml = match[1];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const tds = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      tds.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    const hrefMatch = rowHtml.match(/href="([^"]+)"/i);
    if (tds.length >= 3 && hrefMatch) {
      pricelists.push({
        name: tds[0].replace(/^!\s*/, ''),
        updated_at: tds[1],
        size: tds[2],
        url: hrefMatch[1]
      });
    }
  }
  console.log(`[Sync] Found ${pricelists.length} pricelists on transbaltik.ru`);

  // 4. Save metadata state of all catalogs
  const latestCatalogDate = pricelists.reduce((latest, item) => {
    return item.updated_at > latest ? item.updated_at : latest;
  }, '');

  const catalogStatus = {
    synced_at: new Date().toISOString(),
    latest_catalog_update: latestCatalogDate,
    eur_rub_rate: currentRate,
    total_catalogs: pricelists.length,
    catalogs: pricelists
  };

  const publicDir = path.join(process.cwd(), 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'catalog-status.json'), JSON.stringify(catalogStatus, null, 2));

  const EXCLUDED_KEYWORDS = ['mnogoknig', 'бимбимон', '4games', 'bimbimon'];

  // 5. Select catalogs to sync: covers all publishers from Transbaltik pricelists
  const targetCatalogs = pricelists.filter((p) => {
    if (!p.url || !p.url.startsWith('https://www.transbaltik.ru/uploads/pricelists/')) return false;
    const nameLow = (p.name || '').toLowerCase();
    const urlLow = p.url.toLowerCase();
    if (EXCLUDED_KEYWORDS.some(kw => nameLow.includes(kw) || urlLow.includes(kw))) return false;
    const ext = path.extname(p.url).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') return false;
    // Skip massive files > 25MB to avoid runner out-of-memory
    if (p.size && p.size.includes('MB') && parseFloat(p.size) > 25.0) return false;
    return true;
  });

  console.log(`[Sync] Selected ${targetCatalogs.length} catalogs for book ingestion:`, targetCatalogs.map(c => c.name));

  const allBooksToInsert = [];

  for (const cat of targetCatalogs) {
    try {
      const ext = path.extname(cat.url) || '.xlsx';
      const safeName = cat.name.replace(/[^\p{L}\p{N}]/gu, '_').slice(0, 30);
      const localFile = path.join(tmpDir, `${safeName}${ext}`);
      
      if (!fs.existsSync(localFile) || fs.statSync(localFile).size < 100) {
        console.log(`[Sync] Downloading ${cat.name} (${cat.size})...`);
        await downloadBinary(cat.url, localFile);
      } else {
        console.log(`[Sync] Using cached ${cat.name}...`);
      }

      const wb = readFile(localFile);
      for (const sName of wb.SheetNames) {
        const sheetBooks = parseSheetToBooks(wb.Sheets[sName], cat.name, currentRate, cat.url, cat.updated_at);
        if (sheetBooks.length > 0) {
          // Take up to 250 books per sheet to ensure a diverse catalog across publishers
          const sample = sheetBooks.slice(0, 300);
          console.log(`  -> Sheet "${sName}": ${sheetBooks.length} books found, adding ${sample.length}`);
          allBooksToInsert.push(...sample);
        }
      }
    } catch (err) {
      console.warn(`[Sync] Error processing catalog ${cat.name}:`, err.message);
    }
  }

  console.log(`[Sync] Total books parsed from catalogs: ${allBooksToInsert.length}`);

  // Deduplicate by ISBN: if same ISBN exists, keep the lowest-priced book
  const isbnMap = new Map();
  const withoutIsbn = [];

  for (const b of allBooksToInsert) {
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

  // Deduplicate remaining by name + publisher
  const uniqueMap = new Map();
  for (const b of [...isbnMap.values(), ...withoutIsbn]) {
    const key = `${b.name}:::${b.publisher}`.toLowerCase();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, b);
    } else {
      const existing = uniqueMap.get(key);
      if (Number(b.price) < Number(existing.price)) {
        uniqueMap.set(key, b);
      }
    }
  }
  const uniqueBooks = Array.from(uniqueMap.values());
  console.log(`[Sync] Unique books to insert: ${uniqueBooks.length}`);

  // 6. Batch upsert into Supabase `books` table
  const BATCH_SIZE = 100;
  let insertedCount = 0;

  for (let i = 0; i < uniqueBooks.length; i += BATCH_SIZE) {
    const chunk = uniqueBooks.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/books`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(chunk)
      });
      if (res.ok) {
        insertedCount += chunk.length;
        console.log(`[Sync] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueBooks.length / BATCH_SIZE)} (${insertedCount}/${uniqueBooks.length})`);
      } else {
        const errText = await res.text();
        console.warn(`[Sync] Batch insert warning (${res.status}):`, errText);
      }
    } catch (err) {
      console.warn(`[Sync] Batch insert error:`, err.message);
    }
  }

  // Update total books count in catalog-status.json
  catalogStatus.total_books_synced = insertedCount;
  fs.writeFileSync(path.join(publicDir, 'catalog-status.json'), JSON.stringify(catalogStatus, null, 2));

  console.log(`[Sync] Completed successfully! Synced ${insertedCount} books. Latest update: ${latestCatalogDate}`);
  return catalogStatus;
}

// Run directly if invoked from command line
if (process.argv[1] && process.argv[1].endsWith('syncTransbaltikBooks.js')) {
  syncTransbaltik()
    .then((status) => {
      console.log('[Sync] Done:', status.latest_catalog_update);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Sync] Fatal error:', err);
      process.exit(1);
    });
}
