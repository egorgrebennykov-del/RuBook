import { useState } from "react";
import enhancedImageUrl from "../../../utils/enhancedImageUrl";
import "./BookImage.css";

export default function BookImage({
  src,
  alt = "",
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

  const currentSrc = overrideSrc ?? enhancedImageUrl(src);

  if (!currentSrc || failed) {
    return (
      <div
        className={`${className} book-image__placeholder`}
        aria-label={alt || "Обложка книги"}
      >
        <i className="ri-book-2-line book-image__placeholder-icon" />
        {alt && <span className="book-image__placeholder-title">{alt}</span>}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      referrerPolicy="no-referrer"
      onLoad={onLoad}
      onError={() => {
        if (currentSrc.startsWith("/api/enhance-image")) {
          setFailed(true);
          onError?.();
        } else if (src) {
          // Try backend image proxy
          setOverrideSrc(`/api/enhance-image?url=${encodeURIComponent(src)}`);
        } else {
          setFailed(true);
          onError?.();
        }
      }}
    />
  );
}
