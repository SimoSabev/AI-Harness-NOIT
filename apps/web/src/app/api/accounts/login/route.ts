import { deleteLogin, getLogin, postLogin } from "../../../../lib/server/api";
import { routeDeps } from "../../../../lib/server/admin";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => getLogin(req, routeDeps());
export const POST = (req: Request) => postLogin(req, routeDeps());
export const DELETE = (req: Request) => deleteLogin(req, routeDeps());
