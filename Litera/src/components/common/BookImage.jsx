import { useState, useMemo, useEffect } from "react";
import enhancedImageUrl from "../../../utils/enhancedImageUrl";
import { generateBookCoverSvg } from "../../../utils/generateBookCoverSvg";
import "./BookImage.css";

export default function BookImage({
  src,
  alt = "",
  title = "",
  author = "",
  publisher = "",
  series = "",
  id = 0,
  className = "",
  loading = "lazy",
  decoding = "async",
  fetchPriority = "auto",
  onLoad,
  onError,
}) {
  const [prevSrc, setPrevSrc] = useState(src);
  const [overrideSrc, setOverrideSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setOverrideSrc(null);
    setFailed(false);
    setLoaded(false);
  }

  const effectiveTitle = alt || title || "Книга";
  const fallbackSvg = useMemo(
    () => generateBookCoverSvg({ title: effectiveTitle, author, publisher, series, id }),
    [effectiveTitle, author, publisher, series, id]
  );

  const initialEnhanced = useMemo(() => enhancedImageUrl(src), [src]);
  const currentSrc = overrideSrc ?? (initialEnhanced || fallbackSvg);
  const isDataUri = Boolean(currentSrc?.startsWith("data:"));

  // Fail gracefully to instant SVG if network image takes longer than 2.2 seconds
  useEffect(() => {
    if (!currentSrc || isDataUri || failed || loaded) return;
    const timer = setTimeout(() => {
      setFailed(true);
    }, 2200);
    return () => clearTimeout(timer);
  }, [currentSrc, isDataUri, failed, loaded]);

  const handleLoad = (e) => {
    setLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e) => {
    if (!failed && currentSrc && !isDataUri && !currentSrc.startsWith("/api/enhance-image")) {
      // Try backend enhance proxy first
      setOverrideSrc(`/api/enhance-image?url=${encodeURIComponent(currentSrc)}`);
    } else {
      // Graceful fallback to dynamic SVG book cover
      setFailed(true);
      onError?.(e);
    }
  };

  return (
    <img
      src={failed ? fallbackSvg : currentSrc}
      alt={alt || "Обложка книги"}
      className={`${className} ${loaded || failed || isDataUri ? "book-image--loaded" : "book-image--loading"}`.trim()}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      referrerPolicy="no-referrer"
      style={{
        backgroundImage: `url("${fallbackSvg}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
