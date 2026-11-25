// E9g B (D-377), D-599: the same building blocks as apps/web/src/components/ui.tsx (the Harnova brand kit), so the site looks like the app.
export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] transition hover:brightness-110",
  secondary: "inline-flex items-center justify-center gap-2 rounded-md border border-line-strong bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-raised",
  ghost: "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-mute transition hover:bg-raised hover:text-ink",
} as const;
export const card = "rounded-[10px] border border-line bg-panel";
export const label = "font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-mute";
export const link = "text-accent-text underline-offset-4 hover:underline";
