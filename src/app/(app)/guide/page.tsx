import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { MarkdownDoc } from "@/components/markdown-doc";
import { PageHeader } from "@/components/ui";
import { getFeatures } from "@/server/features";
import { requireUser } from "@/server/session";
import { PrintButton } from "./print-button";

export const metadata = { title: "How it works" };

/** The workflow guide (docs/WORKFLOW.md) for everyone; switchable in Settings → Features (R33). */
export default async function GuidePage() {
  await requireUser();
  if (!(await getFeatures()).guide) notFound();
  const text = await readFile(path.join(process.cwd(), "docs/WORKFLOW.md"), "utf8").catch(() => "# How it works\n\nThe guide isn't available on this server.");
  return (
    <>
      <PageHeader title="How it works" sub="The whole workflow, every screen and button, step by step.">
        <PrintButton />
      </PageHeader>
      <MarkdownDoc text={text.replace(/^# .*\n+/, "")} />
    </>
  );
}
