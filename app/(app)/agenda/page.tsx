import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AgendaClient } from "@/components/agenda/agenda-client";
import { VIEW_COOKIE, isView, todayYmd } from "@/components/agenda/view-utils";
import { getCurrentUser } from "@/lib/session";

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [sp, jar] = await Promise.all([searchParams, cookies()]);
  const v = typeof sp.v === "string" ? sp.v : jar.get(VIEW_COOKIE)?.value;
  const d = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : todayYmd(user.timezone);
  return (
    <AgendaClient
      user={{ email: user.email, name: user.name, timezone: user.timezone }}
      initialView={isView(v) ? v : "dia"}
      initialAnchor={d}
    />
  );
}
