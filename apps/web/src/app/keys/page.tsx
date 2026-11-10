import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// D-475: the keys moved to Settings → API keys; everything this page showed (subscriptions, the research key, channels)
// is there too, so an old link or bookmark loses nothing.
export default function KeysPage(): never {
  redirect("/settings/api-keys");
}
