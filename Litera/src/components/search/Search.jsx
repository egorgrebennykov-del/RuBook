import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useLanguage } from "../../context/languageContext";

const POPULAR_TAGS = [
  "Майор Гром",
  "Габрелянов",
  "Дмитриева",
  "Носов",
  "Сказки",
  "Незнайка",
  "Гарри Поттер",
  "BUBBLE",
  "АСТ",
];

export default function Search({ show, onClose }) {
  const { language, t } = useLanguage();
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [show]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && show) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [show, onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;

    navigate(`/search?q=${encodeURIComponent(text)}`);
    onClose();
  };

  const handleQuickTag = (tag) => {
    setQuery(tag);
    navigate(`/search?q=${encodeURIComponent(tag)}`);
    onClose();
  };

  return (
    <div className={`search ${show ? "show-search" : ""}`} id="search-content">
      <form className="search__form" onSubmit={handleSubmit}>
        <i className="ri-search-line search__icon" />
        <input
          ref={inputRef}
          type="search"
          placeholder={t("search.placeholder")}
          className="search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="search__clear"
            onClick={() => setQuery("")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-color)",
              fontSize: "1.2rem",
              cursor: "pointer",
              padding: "0.25rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            <i className="ri-close-circle-fill" />
          </button>
        )}
        <button
          type="submit"
          className="button"
          style={{
            padding: "0.6rem 1.25rem",
            borderRadius: "0.5rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {language === "ru" ? "Найти" : "Search"}
        </button>
      </form>

      <div className="search__suggestions" style={{ marginTop: "1.25rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.85rem", color: "var(--title-color)", marginBottom: "0.5rem", fontWeight: 500 }}>
          {language === "ru" ? "Популярные запросы:" : "Popular searches:"}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center", maxWidth: "600px", margin: "0 auto" }}>
          {POPULAR_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="search__tag-chip"
              onClick={() => handleQuickTag(tag)}
              style={{
                background: "var(--container-color)",
                border: "1px solid var(--border-color)",
                color: "var(--title-color)",
                padding: "0.35rem 0.85rem",
                borderRadius: "999px",
                fontSize: "0.82rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <i
        className="ri-close-line search__close"
        id="search-close"
        onClick={onClose}
      />
    </div>
  );
}
