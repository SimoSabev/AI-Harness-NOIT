// E9g B (D-377), D-599, D-608: the same building blocks as apps/web/src/components/ui.tsx (the Harnova brand kit and the
// system font of D-602), so the site looks like the app.
export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] transition hover:brightness-110",
  secondary: "inline-flex items-center justify-center gap-2 rounded-md border border-line-strong bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-raised",
  ghost: "inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-raised hover:text-ink",
} as const;
export const card = "rounded-[12px] border border-line bg-panel";
export const label = "text-xs font-medium text-mute";
export const link = "text-accent-text underline-offset-4 hover:underline";
/** D-608: page titles and section heads — tight, balanced, the system face */
export const h1 = "text-3xl font-semibold leading-tight tracking-[-0.02em] text-balance sm:text-4xl";
export const h2 = "text-xl font-semibold tracking-[-0.01em]";
export const lead = "text-lg leading-relaxed text-mute";
