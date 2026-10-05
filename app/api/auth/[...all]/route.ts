import { getAuth } from "@/lib/auth";

async function handler(req: Request): Promise<Response> {
  const auth = await getAuth();
  return auth.handler(req);
}

export { handler as GET, handler as POST };
