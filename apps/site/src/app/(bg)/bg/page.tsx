import { HomePage } from "../../../views/home-page";
import { pageMetadata } from "../../../views/meta";

export const metadata = pageMetadata("bg", "/");

export default function Page() {
  return <HomePage lang="bg" />;
}
