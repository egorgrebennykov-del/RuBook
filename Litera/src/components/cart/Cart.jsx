import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  getCart,
  removeFromCart,
  updateCartQuantity,
} from "../../../utils/cart";
import BookImage from "../common/BookImage";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { useLanguage } from "../../context/languageContext";
import { useAuth } from "../../context/AuthContext";
import "./Cart.css";

function formatPrice(price, currency, language) {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: currency === "EUR" ? 2 : 0,
  }).format(price);
}

export default function Cart({ onSearch }) {
  const { language, t } = useLanguage();
  const location = useLocation();
  const { user, isLoggedIn: loggedIn } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(loggedIn);
  const [error, setError] = useState("");
  const [updatingIds, setUpdatingIds] = useState(() => new Set());
  const [quantityDrafts, setQuantityDrafts] = useState({});

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    getCart(user?.id)
      .then((rows) => !cancelled && setItems(rows))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [loggedIn, user?.id]);

  useEffect(() => {
    if (loading || !location.state?.restoreCartScroll) return;
    const savedScroll = Number(sessionStorage.getItem("kazbook-cart-scroll"));
    sessionStorage.removeItem("kazbook-cart-scroll");
    if (!Number.isFinite(savedScroll)) return;
    requestAnimationFrame(() => window.scrollTo(0, savedScroll));
  }, [loading, location.state]);

  if (!loggedIn) {
    return (
      <section className="cart section container">
        <div className="cart__guest">
          <i className="ri-shopping-basket-2-line cart__guest-icon" />
          <h1 className="cart__title">{t("cart.guestTitle")}</h1>
          <p>{t("cart.guestDesc")}</p>
          <div className="cart__actions">
            <Link className="button" to="/login?redirect=%2Fcart">
              {t("auth.loginBtn")}
            </Link>
            <Link className="cart__signup" to="/sign-up?redirect=%2Fcart">
              {t("auth.signUpBtn")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const handleRemove = async (id) => {
    setError("");
    try {
      await removeFromCart(id, user?.id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleQuantityChange = async (book, quantity) => {
    const nextQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
    setError("");
    setUpdatingIds((current) => new Set(current).add(book.id));
    try {
      await updateCartQuantity(book.id, nextQuantity, user?.id);
      setItems((current) =>
        current.map((item) =>
          item.id === book.id ? { ...item, quantity: nextQuantity } : item,
        ),
      );
      setQuantityDrafts((current) => ({
        ...current,
        [book.id]: String(nextQuantity),
      }));
    } catch (err) {
      setError(err.message);
      setQuantityDrafts((current) => {
        const next = { ...current };
        delete next[book.id];
        return next;
      });
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(book.id);
        return next;
      });
    }
  };

  const totalBooks = items.reduce(
    (total, item) => total + Math.max(1, Number(item.quantity) || 1),
    0,
  );

  const getBookCountText = (count) => {
    if (language === "ru") {
      const mod10 = count % 10;
      const mod100 = count % 100;
      let word = t("cart.bookMany");
      if (mod10 === 1 && mod100 !== 11) {
        word = t("cart.bookSingle");
      } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
        word = t("cart.bookFew");
      }
      return `${count} ${word}`;
    }
    return `${count} ${count === 1 ? t("cart.bookSingle") : t("cart.bookFew")}`;
  };

  return (
    <section className="cart section container">
      <div className="cart__heading">
        <div>
          <h1 className="cart__title">{t("cart.title")}</h1>
          <p className="cart__count">
            {loading
              ? t("cart.loading")
              : error && items.length === 0
                ? t("cart.unavailable")
                : getBookCountText(totalBooks)}
          </p>
        </div>
        {!loading && items.length > 0 && (
          <Link to="/checkout" className="button cart__order-btn">
            <i className="ri-shopping-bag-3-line" />
            <span>{t("cart.makeOrder")}</span>
          </Link>
        )}
      </div>

      {error && (
        <p className="cart__error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="cart__loading" aria-label={t("cart.loading")} />
      ) : items.length === 0 && !error ? (
        <div className="cart__empty">
          <i className="ri-book-open-line" />
          <p>{t("cart.emptyTitle")}</p>
          <button className="button" type="button" onClick={onSearch}>
            {t("cart.findBooks")}
          </button>
        </div>
      ) : (
        <div className="cart__list">
          {items.map((book) => {
            const quantity = Math.max(1, Number(book.quantity) || 1);
            const unitPriceCents = Math.round(Number(book.price) * 100);
            const draft = quantityDrafts[book.id] ?? String(quantity);
            return (
              <article className="cart__item" key={book.id}>
                <Link
                  className="cart__book-link"
                  to={`/book?url=${encodeURIComponent(book.link)}&q=${encodeURIComponent(book.title)}`}
                  state={{
                    book: {
                      title: book.title,
                      url: book.link,
                      image: book.image,
                      store: book.shop,
                      price: Number(book.price),
                      currency: "EUR",
                    },
                    query: book.title,
                    fromCart: true,
                  }}
                  onClick={() =>
                    sessionStorage.setItem(
                      "kazbook-cart-scroll",
                      String(window.scrollY),
                    )
                  }
                >
                  <BookImage
                    className="cart__image"
                    src={book.image}
                    alt={book.title || ""}
                    author={book.author}
                    publisher={book.publisher || book.shop}
                    loading="eager"
                    decoding="auto"
                  />
                  <span className="cart__book-info">
                    <strong>{decodeHtmlEntities(book.title)}</strong>
                    {isPrivileged(user) && book.shop && <small>{book.shop}</small>}
                  </span>
                </Link>
                <div className="cart__quantity" aria-label="Quantity">
                  <button
                    type="button"
                    aria-label={`Decrease ${book.title} quantity`}
                    disabled={quantity <= 1 || updatingIds.has(book.id)}
                    onClick={() => handleQuantityChange(book, quantity - 1)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    aria-label={`${book.title} quantity`}
                    value={draft}
                    disabled={updatingIds.has(book.id)}
                    onChange={(event) =>
                      setQuantityDrafts((current) => ({
                        ...current,
                        [book.id]: event.target.value,
                      }))
                    }
                    onBlur={() => {
                      if (draft === String(quantity)) return;
                      const next = Math.max(1, Math.floor(Number(draft) || 1));
                      setQuantityDrafts((current) => ({
                        ...current,
                        [book.id]: String(next),
                      }));
                      handleQuantityChange(book, next);
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Increase ${book.title} quantity`}
                    disabled={updatingIds.has(book.id)}
                    onClick={() => handleQuantityChange(book, quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <div className="cart__price-block">
                  <strong className="cart__price">
                    {formatPrice((unitPriceCents * quantity) / 100, "EUR", language)}
                  </strong>
                  <small className="cart__unit-price">
                    {formatPrice(unitPriceCents / 100, "EUR", language)} {t("cart.each")}
                  </small>
                </div>
                <button
                  className="cart__remove"
                  type="button"
                  aria-label={`Remove ${book.title} from cart`}
                  title={t("cart.remove")}
                  onClick={() => handleRemove(book.id)}
                >
                  <i className="ri-delete-bin-line" />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
