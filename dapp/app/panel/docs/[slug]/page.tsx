import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getDoc, listDocs } from "@/lib/docs";
import { auth } from "@/auth";
import DocViewer from "@/components/panel/DocViewer";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  return {
    title: doc ? `${doc.title}` : "Documentación",
    description: doc?.summary ?? "Guías del ecosistema NomikOS.",
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");

  const { slug } = await params;
  const locale = await getLocale();
  const doc = getDoc(slug, locale);
  if (!doc) notFound();

  return (
    <div className="theme-light flex h-dvh flex-col overflow-y-auto">
      <DocViewer doc={doc} />
    </div>
  );
}

/** Slugs de todos los idiomas: el locale lo resuelve el layout. */
export function generateStaticParams() {
  return [...listDocs("es"), ...listDocs("en")].map((d) => ({ slug: d.slug }));
}
