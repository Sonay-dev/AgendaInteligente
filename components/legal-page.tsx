import Link from "next/link";

/** Moldura das páginas públicas de texto (privacidade, termos). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <article className="space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">Agenda Sonay</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">Atualizado em {updated}</p>
        </header>
        <div className="space-y-4 text-[15px] leading-relaxed [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_h2]:pt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>
        <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos de uso</Link>
          <Link href="/login">Entrar</Link>
        </footer>
      </article>
    </main>
  );
}
