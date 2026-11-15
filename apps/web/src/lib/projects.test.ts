import { describe, expect, it } from "vitest";
import { DEMO_PROJECT_ID, taskProjects } from "./projects";

// D-525: the demo project is not offered in the task box without the demo switch; a real install has only its own projects.
describe("taskProjects (D-525)", () => {
  const demo = { id: DEMO_PROJECT_ID, full_name: "mandat-demo/shop" };
  const own = { id: "11111111-1111-4111-8111-111111111111", full_name: "simo/app" };
  it("without the switch the demo project is left out", () => {
    expect(taskProjects([demo, own], false)).toEqual([own]);
    expect(taskProjects([demo], false)).toEqual([]);
  });
  it("with the switch everything stays", () => {
    expect(taskProjects([demo, own], true)).toEqual([demo, own]);
  });
});
