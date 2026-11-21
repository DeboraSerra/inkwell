"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";
import { useCallback, useState } from "react";

// Hosts whose covers go through Next's image optimizer, so the app's server
// fetches them and the reader's browser never does. Older Open Library covers
// redirect to the Internet Archive, which some browsers block or which can be
// slow; the server follows those redirects instead. Must match `remotePatterns`
// in next.config.ts, or the optimizer answers 400.
const OPTIMIZED_COVER_HOSTS = new Set(["covers.openlibrary.org", "books.google.com"]);

const isOptimizable = (src: string) => {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && OPTIMIZED_COVER_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

// A book's cover, or the placeholder when there's none or it fails to load.
// `width` and `height` are the displayed size in CSS pixels; `className` sets
// the box. Covers from other hosts (Amazon, any https URL typed by hand) stay
// a plain <img>, since the optimizer only fetches allowed hosts. No referrer
// is sent to those, because some cover hosts refuse requests that carry one.
export function BookCover({
  src,
  className,
  width,
  height,
  lazy = false,
}: Readonly<{
  src?: string | null;
  className?: string;
  width: number;
  height: number;
  lazy?: boolean;
}>) {
  // The URL that failed, so a different cover gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // A server-rendered image can fail before React attaches onError, and that
  // error event is never seen. A finished image with no width failed, so
  // check once when the element mounts.
  const checkLoaded = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth === 0 && src) setFailedSrc(src);
    },
    [src],
  );

  const classes = cn("shrink-0 rounded-sm object-cover", className);
  const loading = lazy ? "lazy" : undefined;

  if (!src || failedSrc === src) {
    return (
      <Image
        src='/assets/cover-placeholder.jpg'
        alt=''
        loading={loading}
        className={classes}
        width={width}
        height={height}
      />
    );
  }
  if (isOptimizable(src)) {
    return (
      <Image
        ref={checkLoaded}
        src={src}
        alt=''
        loading={loading}
        onError={() => setFailedSrc(src)}
        className={classes}
        width={width}
        height={height}
      />
    );
  }
  return (
    <img
      ref={checkLoaded}
      src={src}
      alt=''
      loading={loading}
      referrerPolicy='no-referrer'
      onError={() => setFailedSrc(src)}
      className={classes}
      width={width}
      height={height}
    />
  );
}
