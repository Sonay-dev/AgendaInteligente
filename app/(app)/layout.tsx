import { AppNav } from "@/components/app-nav";
import { OfflineProvider } from "@/components/offline/offline-provider";

// Telas logadas: conteúdo + barra de navegação fixa embaixo (mobile-first) + fila offline (etapa 9).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <OfflineProvider>
        {children}
        <AppNav />
      </OfflineProvider>
    </div>
  );
}
