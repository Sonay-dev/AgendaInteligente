import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type Env = CloudflareEnv;

/** Bindings e secrets do Worker (também funciona no `next dev` via initOpenNextCloudflareForDev). */
export async function getEnv(): Promise<Env> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

export function allowedEmails(env: Pick<Env, "ALLOWED_EMAILS">): Set<string> {
  return new Set(
    (env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(env: Pick<Env, "ALLOWED_EMAILS">, email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails(env).has(email.toLowerCase());
}
