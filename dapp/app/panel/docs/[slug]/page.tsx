import { notFound, redirect } from "next/navigation";
import DocViewer from "@/components/panel/DocViewer";
import { getDoc, listDocs } from "@/lib/docs";
import { auth } from "@/auth";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  return {
    title: doc ? `${doc.title} | Documentación` : "Documentación",
    description: doc?.summary ?? "Guías del ecosistema NomikOS.",
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/");

  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-y-auto">
      <DocViewer doc={doc} />
    </div>
  );
}

export function generateStaticParams() {
  return listDocs().map((d) => ({ slug: d.slug }));
}
