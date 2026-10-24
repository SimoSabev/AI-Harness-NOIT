import type { Lang } from "../i18n/t";
import { SHOT_SIZE, shotSrc } from "../lib/shots";

// E9g B step 7 (D-378): a real screenshot of the harness UI (scripts/site-shots.mjs) in the visitor's theme: the light
// image when the system is light, the dark one otherwise (the site follows the system theme, dark by default).
export function Shot({ name, lang, alt, caption }: { name: string; lang: Lang; alt: string; caption: string }) {
  return (
    <figure className="my-6">
      <picture>
        <source media="(prefers-color-scheme: light)" srcSet={shotSrc(name, lang, "light")} />
        <img src={shotSrc(name, lang, "dark")} alt={alt} width={SHOT_SIZE.width} height={SHOT_SIZE.height} loading="lazy" decoding="async" className="h-auto w-full rounded-xl border border-line" />
      </picture>
      <figcaption className="mt-2 text-sm text-mute">{caption}</figcaption>
    </figure>
  );
}
