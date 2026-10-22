import { cookies } from "next/headers";
import { parseSample } from "../prefs";

export async function sampleOn(): Promise<boolean> {
  return parseSample((await cookies()).get("sample")?.value);
}
