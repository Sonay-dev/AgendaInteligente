import { redirect } from "next/navigation";
import { TasksClient } from "@/components/tasks/tasks-client";
import { getCurrentUser } from "@/lib/session";

export default async function TarefasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <TasksClient timezone={user.timezone} />;
}
