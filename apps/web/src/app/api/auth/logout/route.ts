import { logout } from "../../../../lib/server/auth-routes";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => logout(req);
