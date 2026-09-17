import fs from "fs";
import path from "path";

// legal/*.md live at the vercel-deployment project root (sibling to src/),
// not under src/ -- see next.config.js's outputFileTracingIncludes for why
// that directory is force-included in the deployed build.
//
// react-markdown doesn't process raw HTML by default (no rehype-raw), so an
// <!-- --> block in the source renders as literal visible text instead of
// being dropped as a real comment. These files use HTML comments to keep an
// internal editor's note (e.g. "not reviewed by a lawyer yet") out of the
// public page while keeping it in the single source-of-truth file -- so
// strip comment blocks here before the content ever reaches the renderer.
export function readLegalDoc(filename: string): string {
  const raw = fs.readFileSync(path.join(process.cwd(), "legal", filename), "utf-8");
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    // The source keeps a "*Last updated: [DATE]*" line for editors, but the
    // page shows today's date dynamically instead -- drop the static line
    // so the two don't show two different, unsynced dates.
    .replace(/\*Last updated:.*\*\s*$/, "")
    .trim();
}
