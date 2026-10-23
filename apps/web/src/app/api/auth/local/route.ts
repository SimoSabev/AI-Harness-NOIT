import { localEnter } from "../../../../lib/server/auth-routes";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => localEnter(req);
