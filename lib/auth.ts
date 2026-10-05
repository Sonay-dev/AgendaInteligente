import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { dbFrom } from "@/db";
import * as schema from "@/db/schema";
import { getEnv, isEmailAllowed, type Env } from "./env";
import { hashPassword, verifyPassword } from "./password";

function createAuth(env: Env) {
  const db = dbFrom(env.DB);
  const secure = env.APP_URL.startsWith("https://");

  return betterAuth({
    appName: "Agenda Inteligente",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, { provider: "sqlite", usePlural: true, schema }),
    emailAndPassword: {
      enabled: true,
      // cadastro aberto só para os e-mails de ALLOWED_EMAILS (hook user.create abaixo)
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 dias
      updateAge: 60 * 60 * 24, // renova 1x/dia
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      useSecureCookies: secure,
      cookiePrefix: "agenda",
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: "lax", path: "/" },
      database: { generateId: () => crypto.randomUUID() },
    },
    onAPIError: { errorURL: "/login" },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isEmailAllowed(env, user.email)) {
              throw new APIError("FORBIDDEN", { message: "email_nao_autorizado" });
            }
            return { data: user };
          },
        },
      },
      session: {
        create: {
          // allowlist também na criação de sessão (vale se ALLOWED_EMAILS mudar depois)
          before: async (session) => {
            const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, session.userId));
            if (!isEmailAllowed(env, u?.email)) {
              throw new APIError("FORBIDDEN", { message: "email_nao_autorizado" });
            }
            return { data: session };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const cache = new WeakMap<object, Auth>();

/** Instância por isolate (o binding D1 só existe dentro da requisição). */
export async function getAuth(): Promise<Auth> {
  const env = await getEnv();
  let auth = cache.get(env);
  if (!auth) {
    auth = createAuth(env);
    cache.set(env, auth);
  }
  return auth;
}
