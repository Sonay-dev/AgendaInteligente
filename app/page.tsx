import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, CalendarDays, Inbox, ListChecks, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Agenda Sonay — agenda e tarefas pessoais",
  description:
    "Agenda e lista de tarefas pessoal para gestores: cria, edita e sincroniza compromissos com o seu Google Calendar e envia lembretes.",
};

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Compromissos por texto em português",
    text: "Escreva “reunião com a equipe amanhã às 15h” e o app monta o compromisso com data, hora e recorrência.",
  },
  {
    icon: BellRing,
    title: "Lembretes escalonados",
    text: "Avisos no celular antes de cada compromisso e prazo, mais insistentes para o que é prioritário.",
  },
  {
    icon: ListChecks,
    title: "Tarefas",
    text: "Prioridades, prazos, checklist e acompanhamento do que está aguardando retorno de alguém.",
  },
  {
    icon: Inbox,
    title: "Caixa de entrada",
    text: "Anote ou dite qualquer ideia na hora e decida depois se vira compromisso, tarefa ou nada.",
  },
];

// Página pública (sem login): apresenta o app e explica o uso do Google Calendar.
export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <section className="space-y-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Agenda Sonay</h1>
        <p className="text-xl font-medium text-balance sm:text-2xl">Agenda e lista de tarefas pessoal para gestores</p>
        <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
          Cria, edita e sincroniza compromissos com o Google Calendar do próprio usuário e envia lembretes para que nada
          importante passe despercebido.
        </p>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Link href="/agenda" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
              Abrir minha agenda
            </Link>
          ) : null}
          <Link href="/login" className={cn(buttonVariants({ size: "lg", variant: user ? "outline" : "default" }), "h-11 px-5")}>
            Entrar
          </Link>
          <Link href="/cadastro" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 px-5")}>
            Criar conta
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">O que o app faz</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="space-y-1.5 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-medium">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {title}
              </div>
              <p className="text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border bg-muted/40 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
          Por que o app pede acesso ao Google Calendar
        </h2>
        <p className="text-[15px] leading-relaxed">
          A conexão com o Google é opcional. Quando você conecta, o app usa o acesso ao seu Google Calendar para{" "}
          <strong>criar, atualizar, excluir e ler os seus compromissos</strong> e para <strong>configurar os lembretes</strong>{" "}
          deles, mantendo a agenda do app e a do Google iguais. O app não acessa outros dados da sua conta Google, não vende
          nem compartilha seus dados, e você pode desconectar a qualquer momento.
        </p>
        <p className="text-sm text-muted-foreground">
          Detalhes na <Link href="/privacidade" className="font-medium text-foreground underline underline-offset-4">Política de privacidade</Link>.
        </p>
      </section>

      <footer className="mt-auto flex flex-wrap gap-x-5 gap-y-2 border-t pt-5 text-sm text-muted-foreground">
        <Link href="/privacidade" className="hover:text-foreground">
          Privacidade
        </Link>
        <Link href="/termos" className="hover:text-foreground">
          Termos de uso
        </Link>
        <a href="mailto:sonaydev88@gmail.com" className="hover:text-foreground">
          sonaydev88@gmail.com
        </a>
      </footer>
    </main>
  );
}
