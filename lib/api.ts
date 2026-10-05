import "server-only";
import { getDb } from "@/db";
import { getEnv } from "./env";
import type { Ctx } from "./events-service";
import { requireUser } from "./session";

/** Contexto autenticado das rotas de API. */
export async function apiCtx(): Promise<Ctx> {
  const [user, db, env] = await Promise.all([requireUser(), getDb(), getEnv()]);
  return { user, db, env };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
