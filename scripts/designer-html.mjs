// R57: builds the standalone ID card designer: one HTML file with everything inside (no login, no internet needed).
// Run `npm run designer:build` after changing anything in src/lib/designs/; a test checks the file is up to date.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const OUT = `${root}public/tools/id-card-designer.html`;

export async function designerHtml() {
  const r = await build({
    entryPoints: [`${root}src/lib/designs/standalone.tsx`],
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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ID card designer · Wonder Learning</title>
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
<header><img src="data:image/png;base64,${logo}" alt="Wonder Learning"><b>ID card designer</b></header>
<div class="rb"></div>
<main>
<p>Type the school's details, upload its logo and press <b>Generate designs</b>. Pick a design to download it or share it on WhatsApp.</p>
<div id="root"></div>
</main>
<script>${js}</script>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, await designerHtml());
  console.log(`Wrote ${OUT}`);
}
