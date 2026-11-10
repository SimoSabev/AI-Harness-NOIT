import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeviceApprove } from "../../../components/connections/account/device-approve";
import { getT } from "../../../i18n/server";
import { pageName } from "../../../lib/brand";
import { signInMethods, syncServerSide } from "../../../lib/server/account/wiring";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("device.title")) };
}

// D-495: only on the sync server — the page a device's "Sign in" opens in the system browser.
export default async function DevicePage() {
  if (!syncServerSide()) notFound();
  const t = await getT();
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center font-display text-2xl font-semibold tracking-tight">{t("device.title")}</h1>
        <DeviceApprove methods={signInMethods()} />
      </div>
    </main>
  );
}
