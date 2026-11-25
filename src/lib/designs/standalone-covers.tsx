// R59: entry for the standalone book cover designer (public/tools/book-cover-designer.html), built by
// scripts/designer-html.mjs, which puts the cover pictures in the page as window.WL_ASSETS.
import { createRoot } from "react-dom/client";
import { UKG_COVERS } from "./book-covers";
import { Designer } from "./designer";

const assets = (window as unknown as { WL_ASSETS?: Record<string, string> }).WL_ASSETS ?? UKG_COVERS.assets;

createRoot(document.getElementById("root")!).render(<Designer kinds={[{ ...UKG_COVERS, assets }]} />);
