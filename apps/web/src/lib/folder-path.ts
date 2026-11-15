// D-388 (folder picker): the breadcrumbs of a folder listed by `mandat local` (an absolute POSIX or Windows path).
export interface FolderCrumb {
  name: string;
  path: string;
}

export function folderCrumbs(p: string): FolderCrumb[] {
  const drive = /^([A-Za-z]:)[\\/]/.exec(p);
  const sep = drive ? "\\" : "/";
  const root = drive ? `${drive[1]}\\` : "/";
  const parts = p.slice(root.length).split(/[\\/]+/).filter((s) => s !== "");
  return [{ name: root, path: root }, ...parts.map((name, i) => ({ name, path: root + parts.slice(0, i + 1).join(sep) }))];
}
