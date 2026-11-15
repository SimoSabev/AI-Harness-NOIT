import { describe, expect, it } from "vitest";
import { folderCrumbs } from "./folder-path";

// D-388 (folder picker): the breadcrumbs of a listed folder, POSIX and Windows.
describe("folderCrumbs", () => {
  it("POSIX: the root, then every folder down to the listed one", () => {
    expect(folderCrumbs("/Users/simo/code")).toEqual([
      { name: "/", path: "/" },
      { name: "Users", path: "/Users" },
      { name: "simo", path: "/Users/simo" },
      { name: "code", path: "/Users/simo/code" },
    ]);
    expect(folderCrumbs("/")).toEqual([{ name: "/", path: "/" }]);
  });
  it("Windows: the drive, then the folders, with backslashes", () => {
    expect(folderCrumbs("C:\\Users\\simo")).toEqual([
      { name: "C:\\", path: "C:\\" },
      { name: "Users", path: "C:\\Users" },
      { name: "simo", path: "C:\\Users\\simo" },
    ]);
    expect(folderCrumbs("D:\\")).toEqual([{ name: "D:\\", path: "D:\\" }]);
    expect(folderCrumbs("C:/Users/")).toEqual([{ name: "C:\\", path: "C:\\" }, { name: "Users", path: "C:\\Users" }]);
  });
});
