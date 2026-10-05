"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Category } from "@/components/agenda/api";

const PALETTE = ["#2563eb", "#16a34a", "#0d9488", "#9333ea", "#ca8a04", "#db2777", "#ea580c", "#64748b"];

export function CategoriesManager() {
  const [items, setItems] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]!);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api<{ categories: Category[] }>("/api/categories");
      if (r.ok) setItems(r.data.categories);
      else setError(r.error);
    })();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const r = await api<{ category: Category }>("/api/categories", { method: "POST", body: JSON.stringify({ name, color }) });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setItems((list) => [...(list ?? []), r.data.category].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    setName("");
  }

  async function update(c: Category, patch: Partial<Category>) {
    setItems((list) => list?.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) ?? null);
    const r = await api(`/api/categories/${c.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (!r.ok) {
      toast.error(r.error);
      setItems((list) => list?.map((x) => (x.id === c.id ? c : x)) ?? null);
    }
  }

  async function remove(c: Category) {
    const r = await api(`/api/categories/${c.id}`, { method: "DELETE" });
    if (!r.ok) return void toast.error(r.error);
    setItems((list) => list?.filter((x) => x.id !== c.id) ?? null);
    toast.success(`Categoria "${c.name}" excluída`, { description: "Os compromissos dela ficaram sem categoria." });
  }

  return (
    <section aria-labelledby="cat-title" className="space-y-4 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <Tag className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <h2 id="cat-title" className="font-medium">
            Categorias
          </h2>
          <p className="text-sm text-muted-foreground">Cores usadas na agenda e nos filtros. Toque na cor para trocar.</p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar ({error}).
        </p>
      ) : !items ? (
        <div className="flex justify-center py-4 text-muted-foreground">
          <Loader2 className="animate-spin" aria-label="Carregando" />
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {!items.length && <li className="p-3 text-sm text-muted-foreground">Nenhuma categoria ainda.</li>}
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-2">
              <label className="relative size-7 shrink-0 cursor-pointer rounded-full border" style={{ backgroundColor: c.color }}>
                <span className="sr-only">Cor de {c.name}</span>
                {/* não controlado: o seletor dispara "input" a cada arrasto; salvamos só ao fechar (blur) */}
                <input
                  type="color"
                  defaultValue={c.color}
                  onInput={(e) => (e.currentTarget.parentElement!.style.backgroundColor = e.currentTarget.value)}
                  onBlur={(e) => {
                    if (e.target.value !== c.color) void update(c, { color: e.target.value });
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <Input
                defaultValue={c.name}
                aria-label="Nome da categoria"
                maxLength={40}
                className="h-8"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.name) void update(c, { name: v });
                  else e.target.value = c.name;
                }}
              />
              <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${c.name}`} onClick={() => void remove(c)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-2">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" maxLength={40} aria-label="Nome da nova categoria" />
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Adicionar
          </Button>
        </div>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Cor da nova categoria">
          {PALETTE.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={color === p}
              aria-label={p}
              onClick={() => setColor(p)}
              className="size-6 rounded-full ring-offset-2 ring-offset-background aria-checked:ring-2 aria-checked:ring-foreground"
              style={{ backgroundColor: p }}
            />
          ))}
        </div>
      </form>
    </section>
  );
}
