// v5 E9б (D8): the profile's lint/typecheck commands (layer B) as the checks of a verification. A {files} placeholder
// stands for the whole project: base and tree B run the same command, so a failure on B is the change's.
export interface Check { name: "lint" | "typecheck"; command: string }

export function checksFromCommands(cmds: { lint?: string | undefined; typecheck?: string | undefined }): Check[] {
  const sub = (c: string) => c.replace(/\{files\}/g, ".");
  return [...(cmds.lint ? [{ name: "lint" as const, command: sub(cmds.lint) }] : []), ...(cmds.typecheck ? [{ name: "typecheck" as const, command: sub(cmds.typecheck) }] : [])];
}
