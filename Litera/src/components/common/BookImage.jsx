import { useState, useMemo } from "react";
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

  if (src !== prevSrc) {
    setPrevSrc(src);
    setOverrideSrc(null);
    setFailed(false);
  }

  const effectiveTitle = alt || title || "Книга";
  const fallbackSvg = useMemo(
    () => generateBookCoverSvg({ title: effectiveTitle, author, publisher, series, id }),
    [effectiveTitle, author, publisher, series, id]
  );

  const initialEnhanced = useMemo(() => enhancedImageUrl(src), [src]);
  const currentSrc = overrideSrc ?? (initialEnhanced || fallbackSvg);

  return (
    <img
      src={failed ? fallbackSvg : currentSrc}
      alt={alt || "Обложка книги"}
      className={className}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      referrerPolicy="no-referrer"
      onLoad={onLoad}
      onError={() => {
        if (!failed && currentSrc && !currentSrc.startsWith("data:") && !currentSrc.startsWith("/api/enhance-image")) {
          // Try backend enhance proxy first
          setOverrideSrc(`/api/enhance-image?url=${encodeURIComponent(currentSrc)}`);
        } else {
          // Graceful fallback to dynamic SVG book cover
          setFailed(true);
          onError?.();
        }
      }}
    />
  );
}
