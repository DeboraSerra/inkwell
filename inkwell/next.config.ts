import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Covers from the book APIs are fetched by the app's server rather than the
    // reader's browser (see components/BookCover.tsx). Older Open Library
    // covers redirect to the Internet Archive, which some browsers block; the
    // optimizer follows up to 3 redirects. Keep this list in sync with
    // OPTIMIZED_COVER_HOSTS there.
    remotePatterns: [
      { protocol: "https", hostname: "covers.openlibrary.org", pathname: "/b/**", search: "" },
      // Google's cover links carry the volume id in the query string.
      { protocol: "https", hostname: "books.google.com", pathname: "/books/content" },
    ],
  },
};

export default nextConfig;
