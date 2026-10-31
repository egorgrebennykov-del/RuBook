import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import CarouselControls from "../carouselcontrols/CarouselControls";
import getHomepageBooks, { getCachedHomepageBooks } from "../../../utils/getHomepageBooks";
import BookImage from "../common/BookImage";
import decodeHtmlEntities from "../../../utils/decodeHtmlEntities";
import { useLanguage } from "../../context/languageContext";
import SmallAnnouncements from "../announcements/SmallAnnouncements";
import LargeAnnouncementRoulette from "../announcements/LargeAnnouncementRoulette";
import {
  fetchActiveAnnouncements,
  getCachedActiveAnnouncements,
} from "../../../utils/announcements";
import "./Home.css";

const FALLBACK_PUBLISHERS = [
  "Эксмо",
  "АСТ",
  "Альпина Паблишер",
  "АСТ",
  "Эксмо",
];

function isStoreLabel(value) {
  const clean = String(value ?? "").trim().toLowerCase();
  if (!clean) return true;
  return /\.(md|ro|ru|com)$/i.test(clean);
}

export default function Home() {
  const { language, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [books, setBooks] = useState(() => getCachedHomepageBooks() ?? []);
  const [booksError, setBooksError] = useState(false);
  const [booksReady, setBooksReady] = useState(() => Boolean(getCachedHomepageBooks()));
  const [announcements, setAnnouncements] = useState(
    () => getCachedActiveAnnouncements() ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchActiveAnnouncements()
      .then((items) => {
        if (!cancelled && Array.isArray(items)) {
          setAnnouncements(items);
        }
      })
      .catch((err) => console.warn("Failed to fetch active announcements:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getHomepageBooks()
      .then((items) => !cancelled && Array.isArray(items) && items.length > 0 && setBooks(items))
      .catch(() => !cancelled && setBooksError(true))
      .finally(() => !cancelled && setBooksReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!booksReady || !location.state?.restoreHomeScroll) return;
    const savedPageScroll = Number(
      sessionStorage.getItem("kazbook-home-page-scroll"),
    );
    const savedCarouselScroll = Number(
      sessionStorage.getItem("kazbook-home-carousel-scroll"),
    );
    sessionStorage.removeItem("kazbook-home-page-scroll");
    sessionStorage.removeItem("kazbook-home-carousel-scroll");

    requestAnimationFrame(() => {
      if (Number.isFinite(savedPageScroll)) {
        window.scrollTo(0, savedPageScroll);
      }
      const carousel = document.querySelector(".home__swiper");
      if (carousel && Number.isFinite(savedCarouselScroll)) {
        carousel.scrollTo({ left: savedCarouselScroll, behavior: "instant" });
      }
    });
  }, [booksReady, location.state]);

  const handleHomeSearch = (e) => {
    e.preventDefault();
    const text = searchQuery.trim();
    if (!text) return;
    navigate(`/search?q=${encodeURIComponent(text)}`);
  };

  return (
    <section className="home section" id="home">
      {/* Top Small Announcements Stack */}
      <div className="container">
        <SmallAnnouncements items={announcements} />
      </div>

      {/* Large Announcement Poster / Roulette - Centered & Wide across the page */}
      <div className="container home__large-announcement-wrap">
        <LargeAnnouncementRoulette items={announcements} />
      </div>

      <div className="home__container container grid">
        <div className="home__data">
          <h1 className="home__title">{t("home.title")}</h1>
          <p className="home__description">{t("home.description")}</p>

          <form className="home__search" onSubmit={handleHomeSearch}>
            <i className="ri-search-line home__search-icon" />
            <input
              type="search"
              className="home__search-input"
              placeholder={language === "ru" ? "Найти книгу, автора, серию..." : "Search by title, author, series..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="button home__search-button">
              {language === "ru" ? "Найти" : "Search"}
            </button>
          </form>

          <Link to="/featured" className="button button--secondary home__catalog-btn">
            {t("home.startShopping")}
          </Link>
        </div>
        <div className="home__images">
          <div className="carousel">
            <div className="home__swiper swiper">
              <div className="swiper-wrapper">
                {books.map((book, index) => (
                  <article
                    className="home__article swiper-slide"
                    key={book.url}
                  >
                    <Link
                      className="home__book-link"
                      to={`/book?url=${encodeURIComponent(book.url)}&q=${encodeURIComponent(book.title)}&source=home`}
                      state={{
                        book: {
                          title: book.title,
                          url: book.url,
                          image: book.image,
                          store: book.store,
                          price: book.price,
                          currency: book.currency,
                        },
                        query: book.title,
                        fromHome: true,
                      }}
                      onClick={() => {
                        sessionStorage.setItem(
                          "kazbook-home-page-scroll",
                          String(window.scrollY),
                        );
                        sessionStorage.setItem(
                          "kazbook-home-carousel-scroll",
                          String(
                            document.querySelector(".home__swiper")
                              ?.scrollLeft ?? 0,
                          ),
                        );
                      }}
                    >
                      <BookImage
                        src={book.image}
                        alt={book.title}
                        author={book.author}
                        publisher={book.publisher}
                        id={book.id}
                        className="home__img"
                        loading={index < 4 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index < 2 ? "high" : "auto"}
                      />
                      <span className="home__book-title">
                        {decodeHtmlEntities(book.title)}
                      </span>
                      <span className="home__book-publisher">
                        {(!isStoreLabel(book.publisher) && book.publisher) ||
                          FALLBACK_PUBLISHERS[index % FALLBACK_PUBLISHERS.length]}
                      </span>
                    </Link>
                  </article>
                ))}
              </div>
            </div>
            <CarouselControls className="carousel__controls--home" />
            {books.length === 0 && (
              <div className="home__books-status" role="status">
                {!booksError && <div className="app-route-loader__spinner" style={{ margin: "0 auto 0.75rem" }} />}
                <p>{booksError ? t("featured.error") : t("featured.loading")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
