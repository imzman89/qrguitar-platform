import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "QRguitar",
    short_name: "QRguitar",
    description: "Your instrument collection, permanent Profiles, and history in one place. An internet connection is required.",
    lang: "en",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0c1718",
    theme_color: "#0c1718",
    categories: ["music", "productivity"],
    icons: [
      { src: "/app-icons/qrguitar-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icons/qrguitar-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icons/qrguitar-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
