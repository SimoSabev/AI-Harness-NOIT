import { HomePage } from "../../views/home-page";
import { pageMetadata } from "../../views/meta";

export const metadata = pageMetadata("en", "/");

export default function Page() {
  return <HomePage lang="en" />;
}
