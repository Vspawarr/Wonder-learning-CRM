import { notFound } from "next/navigation";
import { safeFileSrc } from "@/lib/file-preview";
import { requireUser } from "@/server/session";
import { FileViewer } from "./viewer";

export const metadata = { title: "Preview" };

// R62: Preview on phones and in the Android app, which can't show a PDF inside a page (they download it instead).
export default async function ViewPage({ searchParams }: { searchParams: Promise<{ src?: string; name?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const src = safeFileSrc(sp.src);
  if (!src) notFound();
  return <FileViewer src={src} name={sp.name?.slice(0, 120) || "Preview"} />;
}
