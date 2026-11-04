import { describe, expect, it } from "vitest";
import { SubscriptionId } from "@mandat/contract";
import { providerChoices, subscriptionCards, suggestAccountName } from "./subscriptions-view";

// D-462: Settings → Subscriptions — what the cards and the "Add subscription" picker show, from the registry (D-460).
describe("subscriptions view (D-462)", () => {
  const acct = (name: string, cli: SubscriptionId, loggedIn: boolean, email: string | null = null, plan: string | null = null) => ({ name, agent: `${cli}@${name}`, cli, loggedIn, email, plan });

  it("one card per account: product name, who, plan, status; signed-in first", () => {
    const cards = subscriptionCards([acct("old", "claude", false), acct("lichno", "claude", true, "s@example.com", "Max"), acct("rabota", "codex", true, null, "ChatGPT"), acct("g", "gemini", false)]);
    expect(cards.map((c) => [c.name, c.status])).toEqual([["lichno", "signed_in"], ["rabota", "signed_in"], ["old", "expired"], ["g", "unavailable"]]);
    expect(cards[0]).toMatchObject({ product: "Claude", cli: "claude", who: "s@example.com", plan: "Max", agent: "claude@lichno", canSignInAgain: true });
    expect(cards[3]).toMatchObject({ product: "Gemini", canSignInAgain: false });
  });

  it("the picker lists every provider of the registry; only the ones that can run have a sign-in, the rest say why", () => {
    const list = providerChoices();
    expect(list.map((p) => p.id).sort()).toEqual([...SubscriptionId.options].sort());
    expect(list.find((p) => p.id === "claude")).toMatchObject({ canSignIn: true, why: "ready", method: "paste_code" });
    expect(list.find((p) => p.id === "codex")).toMatchObject({ canSignIn: true, why: "untested", method: "device_code" });
    expect(list.find((p) => p.id === "gemini")).toMatchObject({ canSignIn: false, why: "terms" });
    // D-464: the CLIs of the image sign in now; Antigravity's terms forbid it
    for (const id of ["copilot", "kimi", "minimax"] as const) expect(list.find((p) => p.id === id)).toMatchObject({ canSignIn: true, why: "untested", method: "device_code" });
    expect(list.find((p) => p.id === "cursor")).toMatchObject({ canSignIn: true, why: "untested", method: "link" });
    expect(list.find((p) => p.id === "antigravity")).toMatchObject({ canSignIn: false, why: "terms" });
    // the ones you can use now come first
    const firstOff = list.findIndex((p) => !p.canSignIn);
    expect(list.slice(firstOff).every((p) => !p.canSignIn)).toBe(true);
  });

  it("a free account name per provider: lichno, lichno-chatgpt, then numbered", () => {
    expect(suggestAccountName("claude", [])).toBe("lichno");
    expect(suggestAccountName("codex", [])).toBe("lichno-chatgpt");
    expect(suggestAccountName("claude", ["lichno"])).toBe("lichno-2");
    expect(suggestAccountName("claude", ["lichno", "lichno-2"])).toBe("lichno-3");
  });
});
