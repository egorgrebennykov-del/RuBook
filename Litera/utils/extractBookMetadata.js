export function extractBookMetadata(rawDescription) {
  if (!rawDescription || typeof rawDescription !== "string") {
    return { cleanDescription: "", extracted: {} };
  }

  let text = rawDescription.trim();
  const extracted = {};

  // 1. TAIL EXTRACTION (from raw catalog text dumps)
  // Look for "Артикул: 301815 Категория: ... Автор Достоевский Ф." at the end
  const tailRegex =
    /(?:(?:\n|\r|\s|^)(?:Артикул|Категория)\s*[:\t]|(?:\n|\r|^)\s*Автор\s*[:\t\n])[\s\S]*$/i;
  const tailMatch = text.match(tailRegex);
  if (tailMatch) {
    const tailText = tailMatch[0];

    const skuMatch = tailText.match(/Артикул\s*[:\t\s]\s*([A-Za-z0-9_-]+)/i);
    if (skuMatch) extracted.code = skuMatch[1].trim();

    const catMatch = tailText.match(
      /Категория\s*[:\t\s]\s*(?:\[([^\]]+)\]\([^)]+\)|([^\n\r]+?)(?=\s*Автор|\s*Артикул|$))/i,
    );
    if (catMatch) {
      const cat = (catMatch[1] || catMatch[2] || "")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (cat) extracted.genre = cat;
    }

    const authorMatch = tailText.match(
      /Автор\s*[:\t\n\s]+([^\n\r]+?)(?=\s*Артикул|\s*Категория|$)/i,
    );
    if (authorMatch) {
      const a = authorMatch[1].replace(/<[^>]+>/g, "").trim();
      if (a && a.length < 60) extracted.author = a;
    }

    text = text.slice(0, tailMatch.index).trim();
  }

  // 2. PREFIX EXTRACTION (prefix metadata)
  // Pattern example: "автор — Фёдор Достоевский, изд. Эксмо, серия — Магистраль. Главный тренд,  288 стр.  (мягкая обложка).   Текст..."
  // or "изд. Эксмо. (мягкая обложка). «Игрок» занимает..."
  let changed = true;
  while (changed) {
    changed = false;

    // Check author prefix: "автор — Ф. М. Достоевский, изд. Эксмо..."
    const authorPfx = text.match(
      /^автор\s*[-–—:]\s*([^,;\n]+?)(?=\s*[,;]|\.\s*(?=(?:изд|серия|\d+\s*стр|\(|[«"“]))|$)/i,
    );
    if (authorPfx) {
      if (!extracted.author) extracted.author = authorPfx[1].trim();
      text = text.slice(authorPfx[0].length).replace(/^[,;.]\s*/, "").trim();
      changed = true;
      continue;
    }

    // Check publisher prefix: "изд. Эксмо. (мягкая обложка)..." or "издательство АСТ, серия..."
    const pubPfx = text.match(
      /^(?:изд\.|издательство)\s*[-–—:]?\s*([^,;().\n]+?)(?=\s*[,;]|\.\s*(?=[А-ЯA-Z«"“\d]|\()|\s*\.?(?:\s*(?:серия|\d+\s*стр|\())|$)/i,
    );
    if (pubPfx) {
      if (!extracted.publisher) extracted.publisher = pubPfx[1].trim();
      text = text.slice(pubPfx[0].length).replace(/^[,;.]\s*/, "").trim();
      changed = true;
      continue;
    }

    // Check series prefix: "серия — Магистраль. Главный тренд, 288 стр..."
    const seriesPfx = text.match(
      /^серия\s*[-–—:]\s*([^,;()\n]+?)(?=\s*[,;]|\.\s*(?=[«"“]|\((?:мягк|тверд)|\d+\s*стр|изд)|$)/i,
    );
    if (seriesPfx) {
      if (!extracted.series) extracted.series = seriesPfx[1].trim();
      text = text.slice(seriesPfx[0].length).replace(/^[,;.]\s*/, "").trim();
      changed = true;
      continue;
    }

    // Check pages prefix: "288 стр. (мягкая обложка)..."
    const pagesPfx = text.match(/^(\d+)\s*(?:стр|страниц|с\.)[,;.]?\s*/i);
    if (pagesPfx) {
      if (!extracted.pages) extracted.pages = pagesPfx[1].trim();
      text = text.slice(pagesPfx[0].length).trim();
      changed = true;
      continue;
    }

    // Check binding prefix: "(мягкая обложка)", "(твердый переплет)", etc.
    const bindingPfx = text.match(
      /^(?:\((?:в\s+)?(мягк[а-я]+\s+обложк[а-я]+|тверд[а-я]+\s+переплет[а-я]*|тверд[а-я]+\s+обложк[а-я]+|интегральн[а-я]+\s+переплет[а-я]*|мягк[а-я]+\s+переплет[а-я]*)\)|(?:в\s+)?(мягк[а-я]+\s+обложк[а-я]+|тверд[а-я]+\s+переплет[а-я]*|тверд[а-я]+\s+обложк[а-я]+|интегральн[а-я]+\s+переплет[а-я]*|мягк[а-я]+\s+переплет[а-я]*))[,;.]?\s*/i,
    );
    if (bindingPfx) {
      const raw = (bindingPfx[1] || bindingPfx[2] || "").trim().toLowerCase();
      if (!extracted.binding) {
        if (raw.includes("мягк")) extracted.binding = "Мягкая обложка";
        else if (raw.includes("тверд")) extracted.binding = "Твердый переплет";
        else if (raw.includes("интегральн")) extracted.binding = "Интегральный переплет";
        else extracted.binding = raw;
      }
      text = text.slice(bindingPfx[0].length).trim();
      changed = true;
      continue;
    }
  }

  // Clean leading punctuation, whitespace, and dashes
  text = text.replace(/^[,;.\s–—-]+/, "").trim();

  return {
    cleanDescription: text,
    extracted,
  };
}

export default extractBookMetadata;
