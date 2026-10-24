import { redirect } from "next/navigation";
import { taskHref } from "../../../lib/nav";

// D-386: one page per task — the tasks page with the task open (verdict, change, decision, then the details).
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(taskHref((await params).id));
}
