import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import searchBooks from "../../../utils/searchBooks";
import { useSearchCache } from "../../context/searchCache";
import { addToCart, getCart, removeFromCart } from "../../../utils/cart";
import { getCookieUser, isLoggedIn, isPrivileged } from "../../../utils/auth";
import BookImage from "../common/BookImage";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { hasValidImageUrl } from "../../../utils/enhancedImageUrl";
import { useLanguage } from "../../context/languageContext";
import "./SearchResults.css";

const loadingMessages = {
  ru: [
    "Ищем книги в каталоге",
    "Проверяем авторов и серии",
    "Ищем по издательствам Transbaltik",
    "Подбираем подходящие издания",
    "Формируем результаты поиска",
    "Почти готово",
  ],
  en: [
    "Searching book catalog",
    "Checking authors and series",
    "Scanning Transbaltik publisher listings",
    "Finding matching editions",
    "Gathering search results",
    "Almost ready",
  ],
};

function LoadingMessage({ language }) {
  const [index, setIndex] = useState(0);
  const messages = loadingMessages[language] || loadingMessages.en;

  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % messages.length),
      2000,
    );
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <p key={index} className="results__message">
      {messages[index]}
      <span className="results__dots" />
    </p>
  );
}

export default function SearchResults() {
  const { language, t } = useLanguage();
  const [params] = useSearchParams();
  const { query: routeQuery } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = params.get("q") ?? (routeQuery ? decodeURIComponent(routeQuery) : "");
  const cache = useSearchCache();
  const restoredRef = useRef(false);
  const [inputVal, setInputVal] = useState(query);
  const [result, setResult] = useState({ query: "", books: [] });
  const [imageStatuses, setImageStatuses] = useState(() => new Map());
  const [cartItems, setCartItems] = useState(() => new Map());
  const [quantities, setQuantities] = useState(() => new Map());
  const [pendingUrls, setPendingUrls] = useState(() => new Set());
  const loggedIn = isLoggedIn();
  const userId = getCookieUser()?.id;
  const needsCartCheck = loggedIn && Boolean(userId);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [addingUrls, setAddingUrls] = useState(() => new Set());
  const [cartError, setCartError] = useState("");
  const cartReady = !needsCartCheck || cartLoaded;

  useEffect(() => {
    setInputVal(query);
  }, [query]);

  const cached = cache.get(query);
  const [searching, setSearching] = useState(false);
  const books = cached ?? (result.query === query ? result.books : []);
  const isSearching = Boolean(query) && !cached && (searching || result.query !== query);
  const initialLoading = isSearching && books.length === 0;
  const streamingMore = isSearching && books.length > 0;

  useEffect(() => {
    restoredRef.current = false;
  }, [query]);

  useEffect(() => {
    if (restoredRef.current || books.length === 0 || initialLoading) return;

    const raw = sessionStorage.getItem("kazbook-search-scroll");
    const targetUrl = sessionStorage.getItem("kazbook-search-scroll-url");
    const savedQuery = sessionStorage.getItem("kazbook-search-scroll-query");

    if (!raw && !targetUrl) return;
    if (savedQuery && query && savedQuery.toLowerCase() !== query.toLowerCase()) return;

    const savedScroll = Number(raw);
    restoredRef.current = true;

    const restorePosition = () => {
      if (Number.isFinite(savedScroll) && savedScroll > 0) {
        window.scrollTo({ top: savedScroll, behavior: "instant" });
      }
      if (targetUrl) {
        const el = document.getElementById(`book-card-${encodeURIComponent(targetUrl)}`);
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "instant" });
        }
      }
    };

    restorePosition();

    const rId = requestAnimationFrame(() => {
      restorePosition();
      const t1 = setTimeout(restorePosition, 60);
      const t2 = setTimeout(restorePosition, 200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    });

    return () => cancelAnimationFrame(rId);
  }, [books.length, initialLoading, location.state, query]);

  useEffect(() => {
    if (!query || cache.get(query)) {
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    searchBooks(query, {
      onProgress: (partialBooks) => {
        if (!cancelled && partialBooks.length > 0) {
          setResult({ query, books: partialBooks });
        }
      },
    })
      .then((found) => {
        cache.set(query, found);
        if (!cancelled) setResult({ query, books: found });
      })
      .catch(() => !cancelled && setResult({ query, books: [] }))
      .finally(() => !cancelled && setSearching(false));

    return () => {
      cancelled = true;
    };
  }, [query, cache]);

  useEffect(() => {
    if (!needsCartCheck) return;
    let cancelled = false;
    getCart(userId)
      .then((items) => {
        if (!cancelled) {
          setCartItems(new Map(items.map((item) => [item.link, item])));
          setQuantities(
            new Map(
              items.map((item) => [
                item.link,
                Math.max(1, Number(item.quantity) || 1),
              ]),
            ),
          );
        }
      })
      .catch((err) => !cancelled && setCartError(err.message))
      .finally(() => !cancelled && setCartLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [needsCartCheck, userId]);

  const handleToggleCart = async (book) => {
    if (!isLoggedIn()) {
      navigate("/cart");
      return;
    }
    setCartError("");
    const cartItem = cartItems.get(book.url);
    if (cartItem) {
      setAddingUrls((current) => new Set(current).add(book.url));
      try {
        await removeFromCart(cartItem.id, userId);
        setCartItems((current) => {
          const next = new Map(current);
          next.delete(book.url);
          return next;
        });
        setQuantities((current) => new Map(current).set(book.url, 1));
        setPendingUrls((current) => {
          const next = new Set(current);
          next.delete(book.url);
          return next;
        });
      } catch (err) {
        setCartError(err.message);
      } finally {
        setAddingUrls((current) => {
          const next = new Set(current);
          next.delete(book.url);
          return next;
        });
      }
      return;
    }

    if (!pendingUrls.has(book.url)) {
      setQuantities((current) => new Map(current).set(book.url, 1));
      setPendingUrls((current) => new Set(current).add(book.url));
      return;
    }

    setAddingUrls((current) => new Set(current).add(book.url));
    try {
      const quantity = Math.max(
        1,
        Math.floor(Number(quantities.get(book.url)) || 1),
      );
      const inserted = await addToCart(
        {
          title: book.title,
          url: book.url,
          price: book.price,
          currency: book.currency || "EUR",
          image: book.image,
          store: book.store,
          quantity,
        },
        userId,
      );
      if (inserted) {
        setCartItems((current) => new Map(current).set(book.url, inserted));
        setQuantities((current) =>
          new Map(current).set(
            book.url,
            Math.max(1, Number(inserted.quantity) || quantity),
          ),
        );
        setPendingUrls((current) => {
          const next = new Set(current);
          next.delete(book.url);
          return next;
        });
      }
    } catch (err) {
      setCartError(err.message);
    } finally {
      setAddingUrls((current) => {
        const next = new Set(current);
        next.delete(book.url);
        return next;
      });
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const text = inputVal.trim();
    if (!text) return;
    navigate(`/search?q=${encodeURIComponent(text)}`);
  };

  const resultsHeading = query
    ? (language === "ru"
        ? `${t("search.resultsFor")} «${query}»`
        : `${t("search.resultsFor")} “${query}”`)
    : (language === "ru" ? "Поиск книг" : "Search books");

  return (
    <section className="results section container">
      {/* On-page Search Bar */}
      <div className="results__search-bar-wrap">
        <form className="results__search-form" onSubmit={handleSearchSubmit}>
          <i className="ri-search-line results__search-icon" />
          <input
            type="search"
            className="results__search-input"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={
              language === "ru"
                ? "Найти книгу, автора, серию, жанр..."
                : "Search by book title, author, series, genre..."
            }
          />
          {inputVal && (
            <button
              type="button"
              className="results__search-clear"
              onClick={() => setInputVal("")}
              title={language === "ru" ? "Очистить" : "Clear"}
            >
              <i className="ri-close-line" />
            </button>
          )}
          <button type="submit" className="button results__search-submit">
            {language === "ru" ? "Найти" : "Search"}
          </button>
        </form>

        {/* Suggestion Chips */}
        <div className="results__quick-chips">
          {[
            "Майор Гром",
            "Габрелянов",
            "Дмитриева",
            "Носов",
            "Сказки",
            "Незнайка",
            "Гарри Поттер",
            "BUBBLE",
            "АСТ",
          ].map((tag) => (
            <button
              key={tag}
              type="button"
              className={`results__chip ${
                query.toLowerCase() === tag.toLowerCase() ? "results__chip--active" : ""
              }`}
              onClick={() => {
                setInputVal(tag);
                navigate(`/search?q=${encodeURIComponent(tag)}`);
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="results__heading-row">
        <h2 className="section__title results__title-text">{resultsHeading}</h2>
        {!isSearching && books.length > 0 && (
          <span className="results__count-badge">
            {language === "ru" ? `Найдено: ${books.length}` : `Found: ${books.length}`}
          </span>
        )}
      </div>

      {initialLoading && (
        <div className="results__loader">
          <div className="results__spinner" />
          <LoadingMessage language={language} />
        </div>
      )}
      {streamingMore && (
        <div className="results__loader results__loader--inline" role="status" aria-live="polite">
          <div className="results__spinner results__spinner--small" />
          <LoadingMessage language={language} />
        </div>
      )}
      {!isSearching && books.length === 0 && (
        <div className="results__empty-wrap">
          <p className="results__empty-text">{t("search.nothingFound")}</p>
          <div className="results__suggestions">
            <span className="results__suggestions-title">
              {language === "ru" ? "Попробуйте поискать:" : "Try searching for:"}
            </span>
            <div className="results__tags">
              {[
                "Майор Гром",
                "Габрелянов",
                "Дмитриева",
                "Носов",
                "Сказки",
                "Незнайка",
                "Гарри Поттер",
                "BUBBLE",
                "АСТ",
              ].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="results__tag-btn"
                  onClick={() => {
                    setInputVal(tag);
                    navigate(`/search?q=${encodeURIComponent(tag)}`);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {cartError && (
        <p className="results__cart-error" role="alert">
          {cartError}
        </p>
      )}

      <div className="results__grid">
        {books
          .filter(
            (b) =>
              b.image &&
              hasValidImageUrl(b.image) &&
              imageStatuses.get(b.url) !== "failed",
          )
          .map((book, i) => {
            const coverLoaded = imageStatuses.get(book.url) === "loaded";
            const cartItem = cartItems.get(book.url);
            const quantity = Math.max(
              1,
              Number(quantities.get(book.url) ?? cartItem?.quantity) || 1,
            );
            const isBusy = addingUrls.has(book.url) || !cartReady;
            const isPending = pendingUrls.has(book.url);
            const canSeeStore = isPrivileged();
            return (
              <article
                className={`results__card ${coverLoaded ? "results__card--cover-loaded" : ""}`}
                key={book.url}
                id={`book-card-${encodeURIComponent(book.url)}`}
              >
                <Link
                  className="results__open"
                  to={`/book?url=${encodeURIComponent(book.url)}&q=${encodeURIComponent(query)}&source=search`}
                  state={{ book, query, fromSearch: true }}
                  onClick={() => {
                    sessionStorage.setItem("kazbook-search-scroll", String(window.scrollY));
                    sessionStorage.setItem("kazbook-search-scroll-query", query);
                    sessionStorage.setItem("kazbook-search-scroll-url", book.url);
                  }}
                >
                  <BookImage
                    className="results__img"
                    src={book.image}
                    alt={book.title}
                    author={book.author}
                    publisher={book.publisher}
                    id={book.id}
                    loading={i < 6 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={i < 4 ? "high" : "auto"}
                    onLoad={() =>
                      setImageStatuses((current) =>
                        new Map(current).set(book.url, "loaded"),
                      )
                    }
                    onError={() =>
                      setImageStatuses((current) =>
                        new Map(current).set(book.url, "failed"),
                      )
                    }
                  />
                  <h3 className="results__title">{decodeHtmlEntities(book.title)}</h3>
                  {canSeeStore && book.store && (
                    <span className="results__store">{book.store}</span>
                  )}
                  <span className="results__price">
                    {Number.isNaN(book.price)
                      ? "—"
                      : new Intl.NumberFormat(
                          language === "ru" ? "ru-RU" : "en-US",
                          {
                            style: "currency",
                            currency: book.currency,
                            maximumFractionDigits:
                              book.currency === "EUR" ? 2 : 0,
                          },
                        ).format(book.price)}
                  </span>
                </Link>
                <div className="results__cart-actions">
                  {isPending && !cartItem && (
                    <div className="results__quantity-control">
                      <div className="results__quantity" aria-label="Quantity">
                        <button
                          type="button"
                          aria-label={`Decrease ${book.title} quantity`}
                          disabled={isBusy || quantity <= 1}
                          onClick={() =>
                            setQuantities((current) =>
                              new Map(current).set(book.url, quantity - 1),
                            )
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          aria-label={`${book.title} quantity`}
                          value={quantities.get(book.url) ?? quantity}
                          disabled={isBusy}
                          onChange={(event) =>
                            setQuantities((current) =>
                              new Map(current).set(
                                book.url,
                                event.target.value,
                              ),
                            )
                          }
                          onBlur={() =>
                            setQuantities((current) =>
                              new Map(current).set(
                                book.url,
                                Math.max(
                                  1,
                                  Math.floor(
                                    Number(current.get(book.url)) || 1,
                                  ),
                                ),
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Increase ${book.title} quantity`}
                          disabled={isBusy}
                          onClick={() =>
                            setQuantities((current) =>
                              new Map(current).set(book.url, quantity + 1),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                      <button
                        className="results__cart-confirm"
                        type="button"
                        aria-label={`Confirm adding ${book.title} to cart`}
                        title={t("cart.confirm")}
                        disabled={isBusy}
                        onClick={() => handleToggleCart(book)}
                      >
                        <i className="ri-check-line" />
                      </button>
                    </div>
                  )}
                  {(!isPending || cartItem) && (
                    <button
                      className="results__cart-button"
                      type="button"
                      disabled={isBusy}
                      title={cartItem ? t("cart.remove") : t("cart.addToCart")}
                      onClick={() => handleToggleCart(book)}
                    >
                      <i
                        className={
                          cartItem
                            ? "ri-check-line"
                            : "ri-shopping-basket-2-line"
                        }
                      />
                      {addingUrls.has(book.url)
                        ? cartItem
                          ? t("cart.removing")
                          : isPending
                            ? t("cart.adding")
                            : t("cart.addToCart")
                        : cartItem
                          ? t("cart.addedToCart")
                          : cartReady
                            ? t("cart.addToCart")
                            : t("cart.checking")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
}
