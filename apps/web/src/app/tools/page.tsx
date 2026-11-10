import { redirect } from "next/navigation";

// D-487: the tools moved into Settings → MCP, tools and skills.
export default function ToolsPage(): never {
  redirect("/settings/tools");
}
