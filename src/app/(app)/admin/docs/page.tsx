import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader } from "@/components/ui";
import { requireSettingsAdmin } from "@/server/session";

export const metadata = { title: "Project documents" };

// The project documents kept in the repository (docs/ and DEPLOY.md), readable inside the CRM.
const DOCS = [
  { id: "status", file: "docs/STATUS.md", label: "Status" },
  { id: "requirements", file: "docs/REQUIREMENTS.md", label: "Requirements" },
  { id: "rules", file: "docs/BUSINESS_RULES.md", label: "Business rules" },
  { id: "pricing", file: "docs/PRICING.md", label: "Pricing & conflicts" },
  { id: "downloads", file: "docs/DOWNLOADS_AND_TEMPLATES.md", label: "Downloads & templates" },
  { id: "changelog", file: "docs/CHANGELOG.md", label: "Change log" },
  { id: "deploy", file: "DEPLOY.md", label: "Going online" },
] as const;

/** Links between the documents ("REQUIREMENTS.md#r9") stay inside this page. */
function docHref(href: string | undefined) {
  if (!href) return href;
  const [file, hash] = href.split("#");
  const found = DOCS.find((d) => d.file.endsWith(file.replace(/^\.\.?\//, "")) && file.endsWith(".md"));
  return found ? `/admin/docs?doc=${found.id}${hash ? `#${hash}` : ""}` : href;
}

export default async function DocsPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  await requireSettingsAdmin();
  const want = (await searchParams).doc;
  const doc = DOCS.find((d) => d.id === want) ?? DOCS[0];
  const text = await readFile(path.join(process.cwd(), doc.file), "utf8").catch(() => `# ${doc.label}\n\nThis document isn't available on this server.`);
  return (
    <>
      <PageHeader title="Project documents" sub="Requirements, rules, status and every change, kept up to date with each update. The same files are in GitHub under docs/." />
      <div className="tabs" role="tablist">
        {DOCS.map((d) => (
          <Link key={d.id} href={`/admin/docs?doc=${d.id}`} role="tab" aria-selected={d.id === doc.id} className={`tablink ${d.id === doc.id ? "on" : ""}`}>
            {d.label}
          </Link>
        ))}
      </div>
      <article className="card md">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              const to = docHref(href);
              return to?.startsWith("/") ? <Link href={to}>{children}</Link> : <a href={to} target="_blank" rel="noreferrer">{children}</a>;
            },
            table: ({ children }) => (
              <div className="md-table">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {text}
        </Markdown>
      </article>
    </>
  );
}
