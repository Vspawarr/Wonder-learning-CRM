// R57 / R59: builds the standalone designers: one HTML file each, with everything inside (no login, no internet).
//   public/tools/id-card-designer.html     ID cards
//   public/tools/book-cover-designer.html  UKG book covers (the cover pictures are inside the file, ~4 MB)
// Run `npm run designer:build` after changing anything in src/lib/designs/; a test checks the files are up to date.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

export const TOOLS = {
  "id-cards": {
    out: `${root}public/tools/id-card-designer.html`,
    entry: "standalone.tsx",
    title: "ID card designer",
    intro: "Type the school's details, upload its logo and press <b>Generate designs</b>. Pick a design to download it or share it on WhatsApp.",
    assets: [],
  },
  covers: {
    out: `${root}public/tools/book-cover-designer.html`,
    entry: "standalone-covers.tsx",
    title: "Book cover designer",
    intro:
      "Type the school's details, upload its logo and press <b>Generate designs</b>: the school's logo and name go on the front of each UKG book cover, and its logo, address and phone on the back. Pick a cover to download it or share it on WhatsApp.",
    // The cover pictures, put inside the file (see src/lib/designs/book-covers.ts).
    assets: Array.from({ length: 9 }, (_, i) => `ukg-book-${i + 1}`),
  },
};

export async function designerHtml(tool = "id-cards") {
  const t = TOOLS[tool];
  const r = await build({
    entryPoints: [`${root}src/lib/designs/${t.entry}`],
    bundle: true,
    minify: true,
    write: false,
    format: "iife",
    target: "es2019",
    jsx: "automatic",
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const logo = readFileSync(`${root}public/brand/wonder-logo.png`).toString("base64");
  const assets = Object.fromEntries(
    t.assets.map((id) => [id, `data:image/jpeg;base64,${readFileSync(`${root}public/designs/covers/${id}.jpg`).toString("base64")}`]),
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title} · Wonder Learning</title>
<style>
:root{--brand:#6C2D91}
*{box-sizing:border-box}
body{margin:0;background:#f6f2fa;font-family:Figtree,"Segoe UI",Roboto,Arial,sans-serif;color:#2a2233}
header{background:#fff;border-bottom:1px solid #e6e0ee;padding:10px 16px;display:flex;align-items:center;gap:12px}
header img{height:38px}
header b{font-size:17px;color:#6C2D91}
.rb{height:5px;background:linear-gradient(90deg,#E3262C,#F28C1E,#F7C820,#6CB33F,#1FA5DE,#6C2D91)}
main{max-width:800px;margin:0 auto;padding:18px 16px 40px}
main>p{margin:0 0 14px;color:#6b6377}
</style>
</head>
<body>
<header><img src="data:image/png;base64,${logo}" alt="Wonder Learning"><b>${t.title}</b></header>
<div class="rb"></div>
<main>
<p>${t.intro}</p>
<div id="root"></div>
</main>
${t.assets.length ? `<script>window.WL_ASSETS=${JSON.stringify(assets)};</script>\n` : ""}<script>${js}</script>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [tool, t] of Object.entries(TOOLS)) {
    writeFileSync(t.out, await designerHtml(tool));
    console.log(`Wrote ${t.out}`);
  }
}
