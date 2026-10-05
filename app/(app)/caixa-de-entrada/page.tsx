import { redirect } from "next/navigation";
import { InboxClient } from "@/components/inbox/inbox-client";
import { getCurrentUser } from "@/lib/session";

export default async function CaixaDeEntradaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <InboxClient timezone={user.timezone} />;
}
