import { handleAccount } from "../../../../lib/server/account/account-api";
import { accountDeps } from "../../../../lib/server/account/wiring";

// D-497: the optional account of this device (`pnpm local`).
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ op: string }> };
export const GET = async (req: Request, ctx: Ctx) => handleAccount((await ctx.params).op, req, accountDeps());
export const POST = async (req: Request, ctx: Ctx) => handleAccount((await ctx.params).op, req, accountDeps());
