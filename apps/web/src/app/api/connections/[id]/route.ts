import { deleteConnection, patchConnection } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const PATCH = async (req: Request, { params }: { params: Promise<{ id: string }> }) => patchConnection(req, routeDeps(), (await params).id);
export const DELETE = async (req: Request, { params }: { params: Promise<{ id: string }> }) => deleteConnection(req, routeDeps(), (await params).id);
