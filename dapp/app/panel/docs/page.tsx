import { redirect } from "next/navigation";
import { DocsIndex } from "@/components/panel/DocViewer";
import { auth } from "@/auth";

export const metadata = {
  title: "Documentación | Panel",
  description: "Guías del ecosistema NomikOS.",
};

export default async function DocsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/");

  return (
    <div className="flex h-dvh flex-col overflow-y-auto">
      <DocsIndex />
    </div>
  );
}
