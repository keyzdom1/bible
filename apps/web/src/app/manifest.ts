import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    lang: "en",
    name: "HolyWord Bible",
    short_name: "HolyWord",
    description:
      "Offline-first Bible reading, search, highlights, notes, bookmarks and reading plans.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#F4F7FB",
    theme_color: "#123B8F",
    categories: ["books", "lifestyle", "education"],
    shortcuts: [
      {
        name: "Read the Bible",
        short_name: "Read",
        description: "Open the last read chapter.",
        url: "/read",
      },
      {
        name: "Search Scripture",
        short_name: "Search",
        description: "Search words, phrases and references.",
        url: "/search",
      },
    ],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
