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

// Only https covers are shown, as the server only saves those. A URL being
// typed into the cover field (anything, even `javascript:`) shows the
// placeholder until it's one.
const httpsUrl = (src: string) => {
  try {
    const url = new URL(src);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
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

  const url = src ? httpsUrl(src) : null;
  if (!src || !url || failedSrc === src) {
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
  if (OPTIMIZED_COVER_HOSTS.has(url.hostname)) {
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
    // biome-ignore lint/performance/noImgElement: covers from hosts outside next.config's remotePatterns can't go through the optimizer, and need no-referrer
    <img
      ref={checkLoaded}
      src={url.href}
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
