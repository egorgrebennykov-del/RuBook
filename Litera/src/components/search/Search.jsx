import { useState } from "react";
import { useNavigate } from "react-router";
import { useLanguage } from "../../context/languageContext";

const POPULAR_TAGS = [
  "Майор Гром",
  "Габрелянов",
  "Дмитриева",
  "Носов",
  "Достоевский",
  "BUBBLE",
  "АСТ",
];

export default function Search({ show, onClose }) {
  const { language, t } = useLanguage();
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

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
          type="search"
          placeholder={t("search.placeholder")}
          className="search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <div className="search__suggestions" style={{ marginTop: "1rem", textAlign: "center" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center" }}>
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
                padding: "0.3rem 0.75rem",
                borderRadius: "999px",
                fontSize: "0.8rem",
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
