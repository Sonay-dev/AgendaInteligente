import type { MetadataRoute } from "next";

// PWA: instalar na tela inicial (no iPhone, Web Push só funciona com o app instalado — iOS 16.4+).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agenda Inteligente",
    short_name: "Agenda",
    description: "Compromissos, tarefas e lembretes — sincronizados com o Google Calendar.",
    lang: "pt-BR",
    start_url: "/agenda",
    scope: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
