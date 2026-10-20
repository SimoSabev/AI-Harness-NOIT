import { login } from "../../../../lib/server/auth-routes";

export const dynamic = "force-dynamic";
export const POST = (req: Request) => login(req);
