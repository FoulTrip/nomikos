import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { getPreferencesAction } from "@/app/actions/preferences";
import PreferencesForm from "@/components/preferences/PreferencesForm";
import { Button } from "@/components/ui/button";

export async function generateMetadata() {
  const t = await getTranslations("prefs");
  return { title: `${t("title")} | NomikOS` };
}

export default async function PreferencesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  const res = await getPreferencesAction();
  if (!res.ok || !res.preferences) redirect("/signin");
  const t = await getTranslations("prefs");

  return (
    <div className="theme-light flex min-h-dvh flex-col bg-background text-foreground">
      {/* Navbar con la misma altura y ancho del panel; aquí solo se vuelve. */}
      <header className="z-10 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-2.5 sm:px-6 sm:py-3">
          <Button asChild variant="outline" className="h-10 rounded-full px-4">
            <Link href="/panel">
              <ArrowLeft className="size-4" />
              {t("back")}
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-6 p-4 pt-8 pb-12 sm:p-6 sm:pt-8">
        <PreferencesForm initial={res.preferences} />
      </main>
    </div>
  );
}
