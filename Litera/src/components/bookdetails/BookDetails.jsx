import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import getBookDetails from "../../../utils/getBookDetails";
import getExchangeRate from "../../../utils/getExchangeRate";
import { addToCart, getCartItem, removeFromCart } from "../../../utils/cart";
import { getCookieUser, isLoggedIn, isPrivileged } from "../../../utils/auth";
import BookImage from "../common/BookImage";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import extractBookMetadata from "../../../utils/extractBookMetadata";
import { useLanguage } from "../../context/languageContext";
import "./BookDetails.css";

const HIDDEN_PROPERTIES =
  /^(?:вы экономите|иллюстрированное издание|тираж|артикул|поставщик|supplier|sku|код|код товара|код продукта)$/i;

const CANONICAL_PROPERTY_MAP = {
  // Author
  автор: { ru: "Автор", en: "Author", key: "author" },
  aвтор: { ru: "Автор", en: "Author", key: "author" },
  author: { ru: "Автор", en: "Author", key: "author" },

  // Year (unifies "год", "год издания", "год выпуска", "дата выхода", "year")
  год: { ru: "Год издания", en: "Year", key: "year" },
  "год издания": { ru: "Год издания", en: "Year", key: "year" },
  "год выпуска": { ru: "Год издания", en: "Year", key: "year" },
  "дата выхода": { ru: "Год издания", en: "Year", key: "year" },
  year: { ru: "Год издания", en: "Year", key: "year" },

  // Pages (unifies "страницы", "количество страниц", "число страниц", "pages")
  страницы: { ru: "Количество страниц", en: "Pages", key: "pages" },
  "количество страниц": { ru: "Количество страниц", en: "Pages", key: "pages" },
  "число страниц": { ru: "Количество страниц", en: "Pages", key: "pages" },
  pages: { ru: "Количество страниц", en: "Pages", key: "pages" },

  // ISBN (strictly uppercase "ISBN" in all languages)
  isbn: { ru: "ISBN", en: "ISBN", key: "isbn" },
  isbn13: { ru: "ISBN", en: "ISBN", key: "isbn" },
  "isbn-13": { ru: "ISBN", en: "ISBN", key: "isbn" },
  isbn10: { ru: "ISBN", en: "ISBN", key: "isbn" },
  "isbn-10": { ru: "ISBN", en: "ISBN", key: "isbn" },

  // Publisher
  издательство: { ru: "Издательство", en: "Publisher", key: "publisher" },
  издание: { ru: "Издательство", en: "Publisher", key: "publisher" },
  publisher: { ru: "Издательство", en: "Publisher", key: "publisher" },

  // Code / SKU / Article
  код: { ru: "Код товара", en: "Code", key: "code" },
  "код товара": { ru: "Код товара", en: "Code", key: "code" },
  "код продукта": { ru: "Код товара", en: "Code", key: "code" },
  артикул: { ru: "Артикул", en: "Article / SKU", key: "code" },
  sku: { ru: "Артикул", en: "Article / SKU", key: "code" },
  штрихкод: { ru: "Штрихкод", en: "Barcode", key: "barcode" },
  "штрих-код": { ru: "Штрихкод", en: "Barcode", key: "barcode" },
  barcode: { ru: "Штрихкод", en: "Barcode", key: "barcode" },

  // Series / Collection
  серия: { ru: "Серия", en: "Series", key: "series" },
  "серия книг": { ru: "Серия", en: "Series", key: "series" },
  коллекция: { ru: "Серия", en: "Series", key: "series" },
  "kоллекция эксклюзив": { ru: "Серия", en: "Series", key: "series" },
  "коллекция эксклюзив": { ru: "Серия", en: "Series", key: "series" },
  series: { ru: "Серия", en: "Series", key: "series" },

  // Binding
  переплет: { ru: "Переплет", en: "Binding", key: "binding" },
  переплёт: { ru: "Переплет", en: "Binding", key: "binding" },
  "тип переплета": { ru: "Переплет", en: "Binding", key: "binding" },
  обложка: { ru: "Переплет", en: "Binding", key: "binding" },
  "тип обложки": { ru: "Переплет", en: "Binding", key: "binding" },
  "вид обложки": { ru: "Переплет", en: "Binding", key: "binding" },
  binding: { ru: "Переплет", en: "Binding", key: "binding" },

  // Genre
  жанр: { ru: "Жанр", en: "Genre", key: "genre" },
  "жанр / категория": { ru: "Жанр", en: "Genre", key: "genre" },
  genre: { ru: "Жанр", en: "Genre", key: "genre" },

  // Language
  язык: { ru: "Язык", en: "Language", key: "language" },
  language: { ru: "Язык", en: "Language", key: "language" },

  // Format
  формат: { ru: "Формат", en: "Format", key: "format" },
  "формат издания": { ru: "Формат", en: "Format", key: "format" },
  format: { ru: "Формат", en: "Format", key: "format" },

  // Paper
  бумага: { ru: "Бумага", en: "Paper", key: "paper" },
  paper: { ru: "Бумага", en: "Paper", key: "paper" },

  // Age
  возраст: { ru: "Возраст", en: "Age", key: "age" },
  "возрастные ограничения": { ru: "Возраст", en: "Age", key: "age" },
  age: { ru: "Возраст", en: "Age", key: "age" },

  // Country
  "страна производитель": { ru: "Страна", en: "Country", key: "country" },
  страна: { ru: "Страна", en: "Country", key: "country" },
  country: { ru: "Страна", en: "Country", key: "country" },

  // Weight
  вес: { ru: "Вес", en: "Weight", key: "weight" },
  "вес (г)": { ru: "Вес", en: "Weight", key: "weight" },
  weight: { ru: "Вес", en: "Weight", key: "weight" },

  // Supplier
  поставщик: { ru: "Поставщик", en: "Supplier", key: "supplier" },
};

const PROPERTY_VALUES_EN = {
  русский: "Russian",
  румынский: "Romanian",
  молдавский: "Moldavian",
  английский: "English",
  "мягкая обложка": "Softcover",
  "твердый переплет": "Hardcover",
  "твердая обложка": "Hardcover",
  газетная: "Newsprint",
  офсетная: "Offset",
  мелованная: "Coated",
  россия: "Russia",
  молдова: "Moldova",
  да: "Yes",
  нет: "No",
};

const formatCapitalized = (text) => {
  const str = String(text).trim();
  if (!str) return "";
  if (/^isbn/i.test(str)) return "ISBN";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const formatPrice = (value, currency, language) =>
  new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "EUR" ? 2 : 0,
  }).format(value);

export default function BookDetails() {
  const { language, t } = useLanguage();
  const [params] = useSearchParams();
  const { bookId } = useParams();
  const url = params.get("url") ?? (bookId ? decodeURIComponent(bookId) : "");
  const { state } = useLocation();
  const navigate = useNavigate();
  const preview = state?.book;
  const searchQuery = params.get("q") ?? state?.query;
  const fromHome = state?.fromHome || params.get("source") === "home";
  const fromBookPicks = params.get("source") === "book-picks";
  const fromNew = state?.fromNew || params.get("source") === "new";
  const fromSearch = state?.fromSearch || params.get("source") === "search" || Boolean(searchQuery);
  const backTo = state?.fromCart
    ? "/cart"
    : state?.fromDiscount
      ? "/discount"
      : fromBookPicks
        ? "/featured"
        : fromNew
          ? "/new"
        : fromHome
          ? "/"
          : searchQuery
            ? `/search?q=${encodeURIComponent(searchQuery)}`
            : "/";

  const handleBack = () => {
    if (state?.fromCart) {
      navigate("/cart", { state: { restoreCartScroll: true } });
      return;
    }
    if (state?.fromDiscount) {
      navigate("/discount", { state: { restoreDiscountScroll: true } });
      return;
    }
    if (fromHome) {
      navigate("/", { state: { restoreHomeScroll: true } });
      return;
    }
    if (fromBookPicks) {
      navigate("/featured", { state: { restoreFeaturedScroll: true } });
      return;
    }
    if (fromNew) {
      navigate("/new", { state: { restoreNewScroll: true } });
      return;
    }
    if (searchQuery || fromSearch) {
      const q = searchQuery || sessionStorage.getItem("kazbook-search-scroll-query") || "";
      navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search", {
        state: { restoreSearchScroll: true, query: q },
      });
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/");
  };

  const [product, setProduct] = useState(null);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cartStatus, setCartStatus] = useState({
    url: "",
    exists: false,
    id: null,
  });
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartError, setCartError] = useState("");
  const [pendingAddUrl, setPendingAddUrl] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState(1);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);

    Promise.all([getBookDetails(url), getExchangeRate().catch(() => null)])
      .then(([details, eurRate]) => {
        if (cancelled) return;
        setProduct(details);
        setRate(eurRate);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!url || !isLoggedIn()) return;
    let cancelled = false;
    getCartItem(url, getCookieUser()?.id)
      .then(
        (item) =>
          !cancelled &&
          setCartStatus({ url, exists: Boolean(item), id: item?.id ?? null }),
      )
      .catch((err) => !cancelled && setCartError(err.message));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const addedToCart = cartStatus.url === url && cartStatus.exists;

  const title = decodeHtmlEntities(product?.name ?? preview?.title ?? "");
  const image =
    product?.mainImage?.url ?? product?.images?.[0]?.url ?? preview?.image;

  const rawPrice = Number.parseFloat(product?.price);
  const activeRate = rate || 84.0;
  const toEur = (value) => Math.round((value / activeRate) * 100) / 100;
  let price = null;
  const eurVal = Number.isFinite(preview?.price)
    ? (preview.currency !== "EUR" ? toEur(preview.price) : preview.price)
    : Number.isFinite(rawPrice)
      ? (product?.currency === "EUR" ? rawPrice : toEur(rawPrice))
      : null;

  if (eurVal != null) {
    price = formatPrice(eurVal, "EUR", language);
  }

  const descSource = decodeHtmlEntities(
    product?.description || product?.descriptionHtml || "",
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/^[oо]писание[\s\r\n:]*/i, "")
    .trim();

  const { cleanDescription, extracted } = extractBookMetadata(descSource);

  const seenKeys = new Set();
  const rawProps = [...(product?.additionalProperties ?? [])];

  // If ISBN wasn't in additionalProperties, check product.gtin or product.isbn
  if (
    !rawProps.some((p) => /isbn/i.test(p.name)) &&
    (product?.gtin?.[0]?.value || product?.isbn)
  ) {
    rawProps.push({
      name: "isbn",
      value: product?.gtin?.[0]?.value || product?.isbn,
    });
  }

  // If publisher was extracted from description and not yet in rawProps
  if (
    extracted?.publisher &&
    !rawProps.some((p) => /издательств|издание/i.test(p.name))
  ) {
    rawProps.push({
      name: "издательство",
      value: extracted.publisher,
    });
  }

  // If binding was extracted from description and not yet in rawProps
  if (
    extracted?.binding &&
    !rawProps.some((p) => /переплет|обложк/i.test(p.name))
  ) {
    rawProps.push({
      name: "переплет",
      value: extracted.binding,
    });
  }

  // If author was extracted from description and not yet in rawProps
  if (extracted?.author && !rawProps.some((p) => /автор/i.test(p.name))) {
    rawProps.push({
      name: "автор",
      value: extracted.author,
    });
  }

  // If series was extracted from description and not yet in rawProps
  if (extracted?.series && !rawProps.some((p) => /серия/i.test(p.name))) {
    rawProps.push({
      name: "серия",
      value: extracted.series,
    });
  }

  // If pages were extracted from description and not yet in rawProps
  if (extracted?.pages && !rawProps.some((p) => /страниц/i.test(p.name))) {
    rawProps.push({
      name: "количество страниц",
      value: extracted.pages,
    });
  }

  // If genre was extracted from description and not yet in rawProps
  if (extracted?.genre && !rawProps.some((p) => /жанр/i.test(p.name))) {
    rawProps.push({
      name: "жанр",
      value: extracted.genre,
    });
  }

  const properties = rawProps
    .filter(
      (p) =>
        p.name &&
        p.value &&
        !HIDDEN_PROPERTIES.test(String(p.name).trim()),
    )
    .map((p) => {
      const decodedVal = decodeHtmlEntities(p.value).trim();
      const rawName = String(p.name)
        .trim()
        .toLowerCase()
        .replace(/a/g, "а")
        .replace(/k/g, "к");

      const canon = CANONICAL_PROPERTY_MAP[rawName];
      const groupKey = canon ? canon.key : rawName;

      let displayName = canon
        ? language === "en"
          ? canon.en
          : canon.ru
        : formatCapitalized(p.name);

      // Ensure ISBN is ALWAYS uppercase in all languages (ISBN, never isbn or Isbn)
      if (/^isbn/i.test(p.name) || rawName === "isbn") {
        displayName = "ISBN";
      }

      const displayValue =
        language === "en"
          ? (PROPERTY_VALUES_EN[decodedVal.toLowerCase()] ?? decodedVal)
          : formatCapitalized(decodedVal);

      return {
        groupKey,
        name: displayName,
        value: displayValue,
      };
    })
    .filter(
      (p) =>
        !HIDDEN_PROPERTIES.test(p.name) &&
        !HIDDEN_PROPERTIES.test(p.groupKey) &&
        p.groupKey !== "supplier" &&
        p.groupKey !== "code" &&
        !seenKeys.has(p.groupKey) &&
        seenKeys.add(p.groupKey),
    );

  const author = decodeHtmlEntities(
    product?.author ||
      extracted?.author ||
      properties.find((p) => p.groupKey === "author")?.value ||
      preview?.author ||
      "",
  );

  const publisher = decodeHtmlEntities(
    product?.publisher ||
      extracted?.publisher ||
      properties.find((p) => p.groupKey === "publisher")?.value ||
      preview?.publisher ||
      "",
  );

  const year = decodeHtmlEntities(
    product?.year ||
      extracted?.year ||
      properties.find((p) => p.groupKey === "year")?.value ||
      preview?.year ||
      "",
  );

  const series = decodeHtmlEntities(
    product?.series ||
      extracted?.series ||
      properties.find((p) => p.groupKey === "series")?.value ||
      preview?.series ||
      "",
  );

  const genre = decodeHtmlEntities(
    product?.genre ||
      extracted?.genre ||
      properties.find((p) => p.groupKey === "genre")?.value ||
      preview?.genre ||
      "",
  );

  const handleToggleCart = async () => {
    if (!isLoggedIn()) {
      navigate("/cart");
      return;
    }
    setCartError("");
    if (addedToCart && cartStatus.id != null) {
      setAddingToCart(true);
      try {
        await removeFromCart(cartStatus.id);
        setCartStatus({ url, exists: false, id: null });
        setPendingAddUrl("");
        setPendingQuantity(1);
      } catch (err) {
        setCartError(err.message);
      } finally {
        setAddingToCart(false);
      }
      return;
    }
    if (pendingAddUrl !== url) {
      setPendingAddUrl(url);
      setPendingQuantity(1);
      return;
    }

    setAddingToCart(true);
    let euroPrice;
    if (preview && Number.isFinite(preview.price)) {
      euroPrice =
        preview.currency === "EUR"
          ? preview.price
          : Math.round((preview.price / activeRate) * 100) / 100;
    } else if (Number.isFinite(rawPrice)) {
      euroPrice =
        product?.currency === "EUR"
          ? rawPrice
          : Math.round((rawPrice / activeRate) * 100) / 100;
    } else {
      euroPrice = 0;
    }

    try {
      const item = await addToCart({
        title,
        url,
        image,
        store: preview?.store ?? product?.brand?.name ?? "Bookstore",
        price: euroPrice,
        currency: "EUR",
        quantity: pendingQuantity,
      });
      setCartStatus({ url, exists: true, id: item?.id ?? null });
      setPendingAddUrl("");
    } catch (err) {
      setCartError(err.message);
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <section className="book section container">
      <button
        className="book__back"
        onClick={handleBack}
      >
        <i className="ri-arrow-left-line" /> {t("book.back")}
      </button>

      {loading && !preview && (
        <div className="book__loader">
          <div className="book__spinner" />
        </div>
      )}

      {!loading && error && !preview && (
        <p>
          {t("book.notFound")} <Link to="/">{t("book.goHome")}</Link>
        </p>
      )}

      {(preview || !loading) && (!error || preview) && (
        <div className="book__content">
          <BookImage
            src={image}
            alt={title}
            author={author}
            publisher={publisher}
            series={series}
            className="book__img"
            loading="eager"
            fetchPriority="high"
          />

          <div className="book__info">
            <div className="book__badges">
              {isPrivileged() && preview?.store && (
                <span className="book__badge">{preview.store}</span>
              )}
              {product?.availability && (
                <span
                  className={`book__badge ${
                    product.availability === "InStock"
                      ? "book__badge--ok"
                      : "book__badge--no"
                  }`}
                >
                  {product.availability === "InStock"
                    ? t("book.inStock")
                    : t("book.outOfStock")}
                </span>
              )}
            </div>

            <h1 className="book__title">{title}</h1>
            {author && <p className="book__author">{author}</p>}

            {/* Quick Specs Badges: Publisher, Year, Series, Genre */}
            <div className="book__meta-row">
              {publisher && (
                <span className="book__meta-badge" title="Издательство">
                  <i className="ri-building-line" /> {publisher}
                </span>
              )}
              {year && (
                <span className="book__meta-badge" title="Год издания">
                  <i className="ri-calendar-line" /> {year} г.
                </span>
              )}
              {series && (
                <span className="book__meta-badge" title="Серия">
                  <i className="ri-book-mark-line" /> {series}
                </span>
              )}
              {genre && (
                <span className="book__meta-badge" title="Жанр">
                  <i className="ri-price-tag-3-line" /> {genre}
                </span>
              )}
            </div>

            {/* Price in EUR */}
            <div className="book__price-container">
              {price && <span className="book__price">{price}</span>}
            </div>
            {pendingAddUrl === url && !addedToCart ? (
              <div className="book__quantity-control">
                <div className="book__quantity" aria-label="Quantity">
                  <button
                    type="button"
                    aria-label={t("cart.decrease")}
                    disabled={addingToCart || pendingQuantity <= 1}
                    onClick={() =>
                      setPendingQuantity((quantity) =>
                        Math.max(1, quantity - 1),
                      )
                    }
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    aria-label="Quantity"
                    value={pendingQuantity}
                    disabled={addingToCart}
                    onChange={(event) => setPendingQuantity(event.target.value)}
                    onBlur={() =>
                      setPendingQuantity((quantity) =>
                        Math.max(1, Math.floor(Number(quantity) || 1)),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={t("cart.increase")}
                    disabled={addingToCart}
                    onClick={() =>
                      setPendingQuantity((quantity) => Number(quantity) + 1)
                    }
                  >
                    +
                  </button>
                </div>
                <button
                  className="book__cart-confirm"
                  type="button"
                  aria-label={t("cart.confirm")}
                  title={t("cart.confirm")}
                  disabled={addingToCart}
                  onClick={handleToggleCart}
                >
                  <i className="ri-check-line" />
                </button>
              </div>
            ) : (
              <button
                className="book__add-cart button"
                type="button"
                onClick={handleToggleCart}
                disabled={addingToCart}
              >
                <i
                  className={
                    addedToCart ? "ri-check-line" : "ri-shopping-basket-2-line"
                  }
                />
                {addingToCart
                  ? addedToCart
                    ? t("cart.removing")
                    : t("cart.adding")
                  : addedToCart
                    ? t("cart.addedToCart")
                    : t("cart.addToCart")}
              </button>
            )}
            {cartError && (
              <p className="book__cart-error" role="alert">
                {cartError}
              </p>
            )}

            {loading && preview && (
              <p className="book__loading-hint">{t("book.loadingHint")}</p>
            )}

            {cleanDescription && (
              <div className="book__section">
                <h2 className="book__heading">{t("book.about")}</h2>
                <p className="book__description">{cleanDescription}</p>
              </div>
            )}

            {properties.length > 0 && (
              <div className="book__section">
                <h2 className="book__heading">{t("book.details")}</h2>
                <dl className="book__props">
                  {properties.map((p) => (
                    <div key={p.name} className="book__prop">
                      <dt>{p.name}</dt>
                      <dd>{p.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
