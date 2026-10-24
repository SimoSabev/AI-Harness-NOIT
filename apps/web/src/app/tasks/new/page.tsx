import { redirect } from "next/navigation";

// D-384: one way to start a task — the box on the tasks page. The old link (desktop ⌘N, a night question's "Make a
// task" with ?text=) lands there, the text kept.
export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ text?: string | string[] }> }) {
  const q = (await searchParams).text;
  redirect(typeof q === "string" && q !== "" ? `/?text=${encodeURIComponent(q.slice(0, 4000))}` : "/");
}
