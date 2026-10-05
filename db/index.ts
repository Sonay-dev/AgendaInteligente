import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

export type Db = DrizzleD1Database<typeof schema>;

export function dbFrom(d1: D1Database): Db {
  return drizzle(d1, { schema });
}

/** Banco D1 da requisição atual (Worker ou `next dev` com bindings do wrangler). */
export async function getDb(): Promise<Db> {
  const env = await getEnv();
  return dbFrom(env.DB);
}

export { schema };
