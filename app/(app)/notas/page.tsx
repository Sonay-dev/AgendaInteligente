import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotesClient } from "@/components/notes/notes-client";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Quadro de Notas & Lembretes — Agenda Sonay",
  description: "Kanban executivo de anotações, lembretes e fluxo de entregas com cores por status.",
};

export default async function NotasPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/login");

  return <NotesClient timezone={user.timezone} />;
}

