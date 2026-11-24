import { describe, expect, it } from "vitest";
import { homeBrief } from "./home";

// D-600: the start is one conversation with Harnova — a few numbers on top and a first message that says what matters,
// with buttons as answers: get to know a project without a brief first, then what waits for the person, then a new task.
describe("homeBrief (D-600)", () => {
  it("a project without a brief comes first: its interview is the first button", () => {
    const h = homeBrief({ waiting: 3, running: 1, projects: [{ id: "p1", name: "local/shop", brief: false }, { id: "p2", name: "local/bakery-shop", brief: true }], firstWaiting: "/?chat=c_1" });
    expect(h.stats).toEqual({ waiting: 3, running: 1, projects: 2, noBrief: 1 });
    expect(h.say).toEqual({ key: "home.say.noBrief", params: { name: "local/shop", n: 3 } });
    expect(h.actions[0]).toEqual({ kind: "interview", repo: "p1", label: { key: "home.act.meet", params: { name: "local/shop" } } });
    expect(h.actions[1]).toEqual({ kind: "link", href: "/?chat=c_1", label: { key: "home.act.waiting" } });
  });
  it("with every brief approved it points at what waits; with nothing waiting it invites a task", () => {
    const one = [{ id: "p2", name: "local/bakery-shop", brief: true }];
    expect(homeBrief({ waiting: 2, running: 0, projects: one, firstWaiting: "/?task=t_1" }).say).toEqual({ key: "home.say.waiting", params: { n: 2 } });
    const calm = homeBrief({ waiting: 0, running: 1, projects: one, firstWaiting: null });
    expect(calm.say).toEqual({ key: "home.say.calm", params: { n: 1 } });
    expect(calm.actions).toEqual([]);
  });
  it("without any project it asks to add one", () => {
    const h = homeBrief({ waiting: 0, running: 0, projects: [], firstWaiting: null });
    expect(h.say).toEqual({ key: "home.say.noProject" });
    expect(h.actions).toEqual([{ kind: "link", href: "/projects/add", label: { key: "home.act.add" } }]);
  });
});
