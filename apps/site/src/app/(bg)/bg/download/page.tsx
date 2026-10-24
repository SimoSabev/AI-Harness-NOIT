import { DownloadPage } from "../../../../views/download-page";
import { pageMetadata } from "../../../../views/meta";

export const metadata = pageMetadata("bg", "/download/");

export default function Page() {
  return <DownloadPage lang="bg" />;
}
