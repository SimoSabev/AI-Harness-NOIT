import { DocsIndexPage } from "../../../../views/doc-page";
import { pageMetadata } from "../../../../views/meta";

export const metadata = pageMetadata("bg", "/docs/");

export default function Page() {
  return <DocsIndexPage lang="bg" />;
}
