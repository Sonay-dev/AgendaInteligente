import { AppNav } from "@/components/app-nav";

// Telas logadas: conteúdo + barra de navegação fixa embaixo (mobile-first).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      {children}
      <AppNav />
    </div>
  );
}
