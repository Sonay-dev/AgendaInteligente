import "server-only";
import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getEnv, isEmailAllowed } from "./env";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
}

/** Usuário logado e autorizado, ou null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const [auth, env] = await Promise.all([getAuth(), getEnv()]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isEmailAllowed(env, session.user.email)) return null;
  const tz = (session.user as { timezone?: unknown }).timezone;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    timezone: typeof tz === "string" ? tz : "America/Sao_Paulo",
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "não autenticado");
  return user;
}

/** Envolve um route handler: converte HttpError/ZodError em JSON sem vazar detalhes internos. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message, details: e.details }, { status: e.status });
      if (e && typeof e === "object" && "issues" in e) {
        return Response.json({ error: "dados inválidos", details: (e as { issues: unknown }).issues }, { status: 400 });
      }
      console.error("erro interno", e instanceof Error ? e.message : "desconhecido");
      return Response.json({ error: "erro interno" }, { status: 500 });
    }
  };
}
