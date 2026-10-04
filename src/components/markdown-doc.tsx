// Renders one of the project's Markdown documents (docs/*.md) inside the CRM.
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownDoc({ text, linkFor }: { text: string; linkFor?: (href: string | undefined) => string | undefined }) {
  return (
    <article className="card md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const to = linkFor ? linkFor(href) : href;
            return to?.startsWith("/") ? (
              <Link href={to}>{children}</Link>
            ) : (
              <a href={to} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
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
  );
}
