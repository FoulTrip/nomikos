import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { getPreferencesAction } from "@/app/actions/preferences";
import AccountMenu from "@/components/panel/AccountMenu";
import PreferencesForm from "@/components/preferences/PreferencesForm";

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
      {/* Header — mismo lenguaje que /panel: logo + cuenta a la derecha */}
      <header className="sticky top-0 z-10 border-b border-[#EDEDED] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/panel"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#F6F4EF] transition-colors hover:bg-[#F2EBE0]"
              title={t("back")}
            >
              <ArrowLeft className="size-4" />
            </Link>
            <Link href="/panel" className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/nomik-mark-dark.png"
                alt="Nomik"
                width={30}
                height={33}
              />
              <span className="text-[19px] font-semibold tracking-tight">
                Nomik
              </span>
            </Link>
          </div>
          <AccountMenu
            email={session.user.email}
            accountId={session.accountId}
          />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-6 p-4 pt-8 pb-12 sm:p-6 sm:pt-8">
        <header className="grid gap-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sub")}</p>
        </header>
        <PreferencesForm initial={res.preferences} />
      </main>
    </div>
  );
}
