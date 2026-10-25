import { postSystemJob } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const POST = async (req: Request, { params }: { params: Promise<{ job: string }> }) => postSystemJob(req, routeDeps(), (await params).job);
