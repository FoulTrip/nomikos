"use client";
/**
 * landing/blocks — secciones de la portada pública de Nomik (ES/EN).
 * Lenguaje llano, sin tecnicismos. Estilo cálido con shadcn re-tematizado
 * bajo .landing (ver globals.css). Cero dependencias nuevas.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BriefcaseIcon,
  Building03Icon,
  ChatBotIcon,
  CheckmarkBadge01Icon,
  Coins01Icon,
  Home02Icon,
  Link01Icon,
  Mic01Icon,
  ShieldCheckIcon,
  TestTubeIcon,
  Wallet02Icon,
} from "@hugeicons/core-free-icons";
import { Link as LocaleLink } from "@/i18n/navigation";
import {
  CallSpot,
  ChatArt,
  CoinSpot,
  DevicesArt,
  HeroArt,
  MicSpot,
  ReviewArt,
  ShieldSpot,
} from "./art";

/* ── aparición al hacer scroll ─────────────────────────────── */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground text-sm font-semibold tracking-wide">
      {children}
    </span>
  );
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[17px] font-medium">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#44C67F]/15">
        <Check className="size-4 text-[#2f9e63]" strokeWidth={3} />
      </span>
      {children}
    </li>
  );
}

/* ── conmutador English | Español ──────────────────────────── */
function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("landing.locale");
  const opt = (code: "en" | "es", label: string) => (
    <LocaleLink
      key={code}
      href="/"
      locale={code}
      aria-label={`${t("label")}: ${label}`}
      aria-current={locale === code ? "true" : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        locale === code
          ? "bg-white text-[#121212] shadow-sm"
          : "text-[#848281] hover:text-[#121212]"
      }`}
    >
      {label}
    </LocaleLink>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-[#F6F4EF] p-1">
      {opt("en", "English")}
      {opt("es", "Español")}
    </div>
  );
}

/* ── barra superior ────────────────────────────────────────── */
function Navbar() {
  const t = useTranslations("landing.nav");
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#funciones", label: t("features") },
    { href: "#como-funciona", label: t("how") },
    { href: "#web3", label: t("web3") },
    { href: "#empresas", label: t("business") },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-[#EDEDED] bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[67rem] items-center justify-between gap-4 px-6">
        <Link href="#inicio" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nomik-mark-dark.png" alt="Nomik" width={30} height={33} />
          <span className="text-[19px] font-semibold tracking-tight">Nomik</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-[15px] font-medium text-[#282624] transition-colors hover:bg-[#FBFAF9]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <LocaleSwitcher />
          </div>
          <Button asChild variant="ghost" className="lift hidden rounded-full sm:inline-flex">
            <Link href="/signin">{t("signin")}</Link>
          </Button>
          <Button asChild className="lift hidden rounded-full sm:inline-flex">
            <Link href="/signup">{t("signup")}</Link>
          </Button>
          <button
            type="button"
            aria-label={t("menu")}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-xl bg-[#F6F4EF] lg:hidden"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-[#EDEDED] bg-white px-6 py-4 lg:hidden">
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-[17px] font-medium hover:bg-[#FBFAF9]"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="flex gap-2 pt-2">
              <Button asChild variant="secondary" className="lift flex-1 rounded-full">
                <Link href="/signin">{t("signin")}</Link>
              </Button>
              <Button asChild className="lift flex-1 rounded-full">
                <Link href="/signup">{t("signup")}</Link>
              </Button>
            </li>
            <li className="flex justify-center pt-3 sm:hidden">
              <LocaleSwitcher />
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

/* ── héroe ─────────────────────────────────────────────────── */
function Hero() {
  const t = useTranslations("landing.hero");
  return (
    <section id="inicio" className="overflow-hidden">
      <div className="mx-auto grid max-w-[67rem] items-center gap-10 px-6 pt-16 pb-20 md:grid-cols-2 md:pt-24">
        <div className="pop-in">
          <h1 className="text-[40px] leading-[1.05] font-semibold md:text-[64px]">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-md text-[19px] leading-[27px] text-[#494440]">
            {t("sub")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="lift h-12 rounded-full px-7 text-[15px]">
              <Link href="/signup">
                {t("start")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="lift h-12 rounded-full px-7 text-[15px]"
            >
              <Link href="#como-funciona">{t("how")}</Link>
            </Button>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">{t("note")}</p>
        </div>
        <div className="pop-in" style={{ animationDelay: "150ms" }}>
          <HeroArt className="mx-auto w-full max-w-[520px]" />
        </div>
      </div>
    </section>
  );
}

/* ── cinta de frases ───────────────────────────────────────── */
const PHRASE_COLORS = [
  "#F5B442",
  "#44C67F",
  "#7DC4FF",
  "#F966AC",
  "#5F5DE7",
  "#FF5310",
  "#4DAFFF",
  "#FFA620",
];

function Marquee() {
  const t = useTranslations("landing");
  const phrases = t.raw("marquee") as string[];
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center gap-3 pr-3" aria-hidden={hidden}>
      {phrases.map((text, i) => (
        <span
          key={text}
          className="flex items-center gap-2.5 rounded-full bg-[#F6F4EF] px-5 py-2.5 text-[15px] font-medium whitespace-nowrap"
        >
          <span
            className="size-2.5 rounded-full"
            style={{ background: PHRASE_COLORS[i % PHRASE_COLORS.length] }}
          />
          {text}
        </span>
      ))}
    </div>
  );
  return (
    <section aria-label="marquee" className="marquee-mask overflow-hidden py-6">
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}

/* ── funciones ─────────────────────────────────────────────── */
function Features() {
  const t = useTranslations("landing.features");
  const items = t.raw("items") as { title: string; text: string }[];
  const arts = [<MicSpot key="m" />, <CoinSpot key="c" />, <CallSpot key="p" />, <ShieldSpot key="s" />];
  return (
    <section id="funciones" className="mx-auto max-w-[67rem] px-6 py-20">
      <Reveal className="max-w-2xl">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold md:text-[44px] md:leading-[48px]">
          {t("title")}
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((f, i) => (
          <Reveal key={f.title} delay={i * 90}>
            <article className="lift flex h-full flex-col gap-4 rounded-[32px] bg-[#F6F4EF] p-7">
              {arts[i]}
              <h3 className="text-[19px] font-semibold">{f.title}</h3>
              <p className="text-[15px] leading-[22px] text-[#494440]">{f.text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── filas alternas ────────────────────────────────────────── */
function ShowcaseRow({
  eyebrow,
  title,
  text,
  checks,
  art,
  flip = false,
  id,
}: {
  eyebrow: string;
  title: string;
  text: string;
  checks: string[];
  art: ReactNode;
  flip?: boolean;
  id?: string;
}) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 md:grid-cols-2">
      <Reveal className={flip ? "md:order-2" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold md:text-[44px] md:leading-[48px]">
          {title}
        </h2>
        <p className="mt-4 max-w-md text-[17px] leading-[26px] text-[#494440]">
          {text}
        </p>
        <ul className="mt-6 flex flex-col gap-3">
          {checks.map((c) => (
            <CheckItem key={c}>{c}</CheckItem>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={120} className={flip ? "md:order-1" : ""}>
        {art}
      </Reveal>
    </div>
  );
}

function Showcase() {
  const t = useTranslations("landing");
  const rows = t.raw("showcase") as {
    eyebrow: string;
    title: string;
    text: string;
    checks: string[];
  }[];
  const arts = [
    <ChatArt key="c" className="mx-auto w-full max-w-[440px]" />,
    <ReviewArt key="r" className="mx-auto w-full max-w-[440px]" />,
    <DevicesArt key="d" className="mx-auto w-full max-w-[440px]" />,
  ];
  return (
    <section id="como-funciona" className="mx-auto flex max-w-[67rem] flex-col gap-24 px-6 py-20">
      {rows.map((r, i) => (
        <ShowcaseRow
          key={r.title}
          id={i === 2 ? "aparatos" : undefined}
          flip={i === 1}
          eyebrow={r.eyebrow}
          title={r.title}
          text={r.text}
          checks={r.checks}
          art={arts[i]}
        />
      ))}
    </section>
  );
}

/* ── detalles ──────────────────────────────────────────────── */
const DETAIL_DOTS = ["#7DC4FF", "#44C67F", "#F5B442"];

function Details() {
  const t = useTranslations("landing.details");
  const items = t.raw("items") as { title: string; text: string }[];
  return (
    <section className="bg-[#FBFAF9]">
      <div className="mx-auto max-w-[67rem] px-6 py-20">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold md:text-[44px] md:leading-[48px]">
            {t("title")}
          </h2>
          <p className="mt-3 text-[17px] text-[#494440]">{t("sub")}</p>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((d, i) => (
            <Reveal key={d.title} delay={i * 90}>
              <article className="lift h-full rounded-[32px] bg-white p-8 shadow-[0_3px_16px_rgba(0,0,0,0.06)]">
                <span className="block size-3 rounded-full" style={{ background: DETAIL_DOTS[i] }} />
                <h3 className="mt-4 text-[19px] font-semibold">{d.title}</h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#494440]">{d.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── web3: pagos, apps y flujo end-to-end ─────────────────────── */
function Web3() {
  const t = useTranslations("landing.web3");
  const pay = t.raw("pay") as { title: string; text: string }[];
  const payChips = [
    { icon: Wallet02Icon, bg: "#5F5DE7" },
    { icon: Link01Icon, bg: "#4DAFFF" },
    { icon: Coins01Icon, bg: "#F5B442" },
  ];
  const apps = [
    { name: "Kodetap", logo: "/apps/kodetap.png" },
    { name: "Spotify", logo: "/apps/spotify.svg" },
    { name: "WhatsApp", logo: "/apps/whatsapp.svg" },
    { name: "YouTube", logo: "/apps/youtube.svg" },
    { name: "Gmail", logo: "/apps/gmail.svg" },
  ];
  const flow = t.raw("flow") as { title: string; text: string }[];
  const flowIcons = [Mic01Icon, ChatBotIcon, ShieldCheckIcon, Coins01Icon, CheckmarkBadge01Icon];
  return (
    <section id="web3" className="bg-[#FBFAF9]">
      <div className="mx-auto max-w-[67rem] px-6 py-20">
        <Reveal className="max-w-2xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold md:text-[44px] md:leading-[48px]">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-xl text-[17px] leading-[26px] text-[#494440]">
            {t("intro")}
          </p>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {pay.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <article className="lift h-full rounded-[32px] bg-white p-8 shadow-[0_3px_16px_rgba(0,0,0,0.06)]">
                <span
                  className="flex size-14 items-center justify-center rounded-[20px]"
                  style={{ background: payChips[i].bg }}
                >
                  <HugeiconsIcon icon={payChips[i].icon} size={28} color="#FFFFFF" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-[19px] font-semibold">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-[22px] text-[#494440]">{p.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="mt-6 flex flex-col gap-6 rounded-[32px] bg-white p-8 shadow-[0_3px_16px_rgba(0,0,0,0.06)] md:flex-row md:items-center md:gap-8 md:p-10">
            <div className="relative mx-auto flex size-44 shrink-0 items-center justify-center md:mx-0 md:size-52">
              <span aria-hidden="true" className="ripple absolute inset-0 rounded-full border-[3px] border-[#4DAFFF]/50" />
              <span aria-hidden="true" className="ripple absolute inset-0 rounded-full border-[3px] border-[#9945FF]/40" style={{ animationDelay: "1.4s" }} />
              <span aria-hidden="true" className="drift-soft absolute top-[12%] right-[16%] size-2.5 rounded-full bg-[#F5B442]" />
              <span aria-hidden="true" className="drift-soft absolute bottom-[14%] left-[14%] size-2 rounded-full bg-[#44C67F]" style={{ animationDelay: "-2s" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/solana-mark.png" alt="Solana" width={101} height={88} className="drift-soft relative h-auto w-16 md:w-20" />
            </div>
            <div>
              <h3 className="text-[23px] font-semibold">{t("contracts.title")}</h3>
              <p className="mt-2 max-w-2xl text-[15px] leading-[22px] text-[#494440]">
                {t("contracts.text")}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5 md:flex-row md:flex-wrap md:gap-x-6">
                {(t.raw("contracts.points") as string[]).map((c) => (
                  <CheckItem key={c}>{c}</CheckItem>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <div className="mt-6 rounded-[32px] bg-white p-8 shadow-[0_3px_16px_rgba(0,0,0,0.06)] md:p-10">
            <h3 className="text-[23px] font-semibold">{t("appsTitle")}</h3>
            <p className="mt-2 max-w-2xl text-[15px] leading-[22px] text-[#494440]">
              {t("appsText")}
            </p>
            <div className="mt-5 grid grid-cols-3 items-center justify-items-center gap-x-3 gap-y-6 sm:grid-cols-6">
              {apps.map((a) => (
                <div
                  key={a.name}
                  className="lift flex flex-col items-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.logo}
                    alt={a.name}
                    loading="lazy"
                    className="size-12 object-contain drop-shadow-[0_8px_20px_rgba(52,52,51,0.16)]"
                  />
                </div>
              ))}
              <div className="flex flex-col items-center gap-2">
                <span className="lift flex size-12 items-center justify-center rounded-full border-2 border-dashed border-[#E2D6C5]">
                  <Plus className="size-5 text-[#848281]" />
                </span>
                <span className="text-[13px] font-medium text-[#848281]">{t("appsYours")}</span>
              </div>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <h3 className="mt-14 text-center text-[23px] font-semibold">{t("flowTitle")}</h3>
        </Reveal>
        <ol className="mt-8 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {flow.map((s, i) => (
            <Reveal key={s.title} delay={i * 70}>
              <li className="lift relative h-full rounded-[28px] bg-white p-6 shadow-[0_3px_16px_rgba(0,0,0,0.06)]">
                <span className="absolute top-5 right-5 flex size-7 items-center justify-center rounded-full bg-[#F6F4EF] text-[13px] font-semibold text-[#848281]">
                  {i + 1}
                </span>
                <HugeiconsIcon icon={flowIcons[i]} size={30} color="#343433" strokeWidth={2} />
                <p className="mt-3 text-[15px] font-semibold">{s.title}</p>
                <p className="mt-1 text-[14px] leading-[20px] text-[#848281]">{s.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── empezar sin riesgo: flujo cliente + sandbox ─────────────────── */
function Start() {
  const t = useTranslations("landing.start");
  const steps = t.raw("steps") as { title: string; text: string }[];
  return (
    <section id="empezar" className="mx-auto max-w-[67rem] scroll-mt-24 px-6 py-20">
      <Reveal className="max-w-2xl">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold md:text-[44px] md:leading-[48px]">
          {t("title")}
        </h2>
      </Reveal>
      <ol className="mt-10 grid list-none gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 90}>
            <li className="lift relative h-full rounded-[28px] bg-[#F6F4EF] p-7">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#171717] text-[14px] font-semibold text-white">
                {i + 1}
              </span>
              <p className="mt-4 text-[19px] font-semibold">{s.title}</p>
              <p className="mt-2 text-[15px] leading-[22px] text-[#494440]">{s.text}</p>
            </li>
          </Reveal>
        ))}
      </ol>
      <Reveal>
        <div className="mt-6 flex flex-col items-start gap-5 rounded-[32px] bg-[#5F5DE7] p-8 text-white md:flex-row md:items-center md:p-10">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-[22px] bg-white/15">
            <HugeiconsIcon icon={TestTubeIcon} size={32} color="#FFFFFF" strokeWidth={2} />
          </span>
          <div className="flex-1">
            <h3 className="text-[23px] font-semibold text-white">{t("sandbox.title")}</h3>
            <p className="mt-2 max-w-2xl text-[15px] leading-[22px] text-white/80">
              {t("sandbox.text")}
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="lift h-12 shrink-0 rounded-full bg-white px-7 text-[15px] text-[#121212] hover:bg-[#EAE6DD]"
          >
            <Link href="/signup">
              {t("sandbox.button")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

/* ── un OS para cualquier máquina + economía automatizada ────────── */
function Business() {
  const t = useTranslations("landing.business");
  const cases = t.raw("cases") as { title: string; text: string }[];
  const caseChips = [
    { icon: Home02Icon, bg: "#7DC4FF" },
    { icon: Building03Icon, bg: "#F5B442" },
    { icon: BriefcaseIcon, bg: "#5F5DE7" },
  ];
  return (
    <section id="empresas" className="mx-auto max-w-[67rem] px-6 py-20">
      <Reveal className="max-w-2xl">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold md:text-[44px] md:leading-[48px]">
          {t("title")}
        </h2>
        <p className="mt-4 max-w-xl text-[17px] leading-[26px] text-[#494440]">
          {t("intro")}
        </p>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {cases.map((c, i) => (
          <Reveal key={c.title} delay={i * 90}>
            <article className="lift h-full rounded-[32px] bg-[#F6F4EF] p-8">
              <span
                className="flex size-14 items-center justify-center rounded-[20px]"
                style={{ background: caseChips[i].bg }}
              >
                <HugeiconsIcon icon={caseChips[i].icon} size={28} color="#FFFFFF" strokeWidth={2} />
              </span>
              <h3 className="mt-4 text-[19px] font-semibold">{c.title}</h3>
              <p className="mt-2 text-[15px] leading-[22px] text-[#494440]">{c.text}</p>
            </article>
          </Reveal>
        ))}
      </div>
      <Reveal>
        <div className="mt-6 rounded-[32px] bg-[#171717] p-8 text-white md:p-10">
          <h3 className="text-[23px] font-semibold text-white">{t("economy.title")}</h3>
          <p className="mt-2 max-w-2xl text-[15px] leading-[22px] text-white/70">
            {t("economy.text")}
          </p>
          <div className="mt-7">
            <Button
              asChild
              size="lg"
              className="lift h-12 rounded-full bg-white px-7 text-[15px] text-[#121212] hover:bg-[#EAE6DD]"
            >
              <Link href="/signup">
                {t("cta")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ── cierre ────────────────────────────────────────────────── */
function FinalCta() {
  const t = useTranslations("landing.cta");
  return (
    <section className="mx-auto max-w-[67rem] px-6 pb-20">
      <Reveal>
        <div className="flex flex-col items-center gap-6 rounded-[40px] bg-[#171717] px-8 py-16 text-center text-white md:py-20">
          <h2 className="max-w-xl text-3xl font-semibold text-white md:text-[44px] md:leading-[48px]">
            {t("title")}
          </h2>
          <p className="max-w-md text-[17px] text-white/70">{t("text")}</p>
          <Button
            asChild
            size="lg"
            className="lift h-12 rounded-full bg-white px-8 text-[15px] text-[#121212] hover:bg-[#EAE6DD]"
          >
            <Link href="/signup">
              {t("button")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

/* ── pie ───────────────────────────────────────────────────── */
function Footer() {
  const t = useTranslations("landing.footer");
  const tn = useTranslations("landing.nav");
  return (
    <footer className="border-t border-[#EDEDED]">
      <div className="mx-auto flex max-w-[67rem] flex-col gap-10 px-6 py-14 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <Link href="#inicio" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nomik-mark-dark.png" alt="Nomik" width={26} height={28} />
            <span className="text-[17px] font-semibold tracking-tight">Nomik</span>
          </Link>
          <p className="mt-3 text-[15px] text-[#848281]">{t("tagline")}</p>
          <div className="mt-4">
            <LocaleSwitcher />
          </div>
        </div>
        <nav className="grid grid-cols-2 gap-10 sm:gap-20">
          <ul className="flex flex-col gap-2.5">
            <li className="pb-1 text-[13px] font-semibold tracking-wide text-[#848281]">{t("product")}</li>
            {[
              ["#funciones", tn("features")],
              ["#como-funciona", tn("how")],
              ["#web3", tn("web3")],
              ["#empresas", tn("business")],
              ["#empezar", tn("start")],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-[15px] text-[#494440] hover:text-[#121212]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-2.5">
            <li className="pb-1 text-[13px] font-semibold tracking-wide text-[#848281]">{t("account")}</li>
            <li><Link href="/signin" className="text-[15px] text-[#494440] hover:text-[#121212]">{t("signin")}</Link></li>
            <li><Link href="/signup" className="text-[15px] text-[#494440] hover:text-[#121212]">{t("signup")}</Link></li>
            <li><Link href="/panel" className="text-[15px] text-[#494440] hover:text-[#121212]">{t("panel")}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto max-w-[67rem] px-6 pb-8">
        <p className="text-[13px] text-[#848281]">{t("rights")}</p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Marquee />
        <Features />
        <Showcase />
        <Web3 />
        <Business />
        <Start />
        <Details />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
