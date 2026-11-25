import type { Lang } from "../i18n/t";
import { SHOT_SIZE, shotSrc } from "../lib/shots";

// E9g B step 7 (D-378), D-606: a real screenshot of the app (scripts/site-shots.mjs) in the visitor's theme — the light
// image when the system is light, the dark one otherwise — framed like the app's window (a title bar with three dots).
export function Shot({ name, lang, alt, caption }: { name: string; lang: Lang; alt: string; caption: string }) {
  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-[12px] border border-line-strong bg-panel shadow-[0_20px_50px_-20px_rgb(0_0_0/0.5)]">
        <div aria-hidden="true" className="flex items-center gap-1.5 border-b border-line px-3 py-2">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <picture>
          <source media="(prefers-color-scheme: light)" srcSet={shotSrc(name, lang, "light")} />
          <img src={shotSrc(name, lang, "dark")} alt={alt} width={SHOT_SIZE.width} height={SHOT_SIZE.height} loading="lazy" decoding="async" className="block h-auto w-full" />
        </picture>
      </div>
      <figcaption className="mt-3 text-sm text-mute">{caption}</figcaption>
    </figure>
  );
}
