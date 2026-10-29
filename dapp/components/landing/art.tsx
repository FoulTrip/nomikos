/**
 * landing/art — ilustraciones de la landing con HugeIcons sobre
 * composiciones cálidas originales (chips flotantes + formas beige).
 */
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BotIcon,
  Call02Icon,
  ChatBotIcon,
  CheckmarkBadge01Icon,
  Coins01Icon,
  FavouriteIcon,
  Mic01Icon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  UserIcon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";

/* ── primitivas ──────────────────────────────────────────── */

function Sparkle({
  className = "",
  delay = "0s",
  size = 26,
  fill = "#F5B442",
}: {
  className?: string;
  delay?: string;
  size?: number;
  fill?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-14 -14 28 28"
      aria-hidden="true"
      className={`drift-soft ${className}`}
      style={{ animationDelay: delay }}
    >
      <path
        d="M0 -14 C1.5 -6 6 -1.5 14 0 C6 1.5 1.5 6 0 14 C-1.5 6 -6 1.5 -14 0 C-6 -1.5 -1.5 -6 0 -14 Z"
        fill={fill}
      />
    </svg>
  );
}

function Dot({
  className = "",
  size = 14,
  fill = "#44C67F",
  delay = "0s",
}: {
  className?: string;
  size?: number;
  fill?: string;
  delay?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`drift-soft rounded-full ${className}`}
      style={{ width: size, height: size, background: fill, animationDelay: delay }}
    />
  );
}

function Chip({
  icon,
  bg,
  className = "",
  delay = "0s",
  iconClassName = "w-1/2 h-auto",
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  bg: string;
  className?: string;
  delay?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={`drift flex items-center justify-center shadow-[0_10px_30px_rgba(52,52,51,0.12)] ${className}`}
      style={{ background: bg, animationDelay: delay }}
    >
      <HugeiconsIcon icon={icon} color="#FFFFFF" strokeWidth={2} className={iconClassName} />
    </div>
  );
}

/* ── héroe ───────────────────────────────────────────────── */

export function HeroArt({ className = "" }: { className?: string }) {
  return (
    <div className={`relative aspect-square ${className}`} role="img" aria-label="Ilustración de Nomik">
      <div className="absolute top-[6%] left-[10%] size-[80%] rounded-full bg-[#F6F4EF]" />
      <div className="absolute top-[10%] left-[6%] size-[26%] rounded-full bg-[#F2EBE0]" />
      <div className="absolute right-[4%] bottom-[6%] size-[30%] rounded-full bg-[#F2EBE0]" />

      {/* pieza central */}
      <div className="drift absolute top-[33%] left-[33%] flex aspect-square w-[34%] items-center justify-center rounded-[28%] bg-[#7DC4FF] shadow-[0_18px_50px_rgba(77,175,255,0.35)]">
        <HugeiconsIcon
          icon={ChatBotIcon}
          color="#FFFFFF"
          strokeWidth={1.8}
          size={68}
          className="size-[clamp(44px,13vw,68px)]"
        />
      </div>

      <Chip icon={Coins01Icon} bg="#F5B442" delay="-1.5s" className="absolute top-[8%] right-[16%] aspect-square w-[17%] rounded-[30%]" />
      <Chip icon={ShieldCheckIcon} bg="#44C67F" delay="-3s" className="absolute bottom-[10%] left-[10%] aspect-square w-[17%] rounded-[30%]" />
      <Chip icon={FavouriteIcon} bg="#FF5310" delay="-2.2s" className="absolute top-[38%] right-[2%] aspect-square w-[15%] rounded-[30%]" />
      <Chip icon={Mic01Icon} bg="#5F5DE7" delay="-4s" className="absolute top-[14%] left-[2%] aspect-square w-[15%] rounded-[30%]" />
      <Chip icon={Call02Icon} bg="#F966AC" delay="-0.8s" className="absolute right-[10%] bottom-[4%] aspect-square w-[15%] rounded-[30%]" />

      <Sparkle className="absolute top-[4%] left-[38%]" delay="-2.4s" />
      <Sparkle className="absolute bottom-[24%] left-[2%]" size={20} fill="#5F5DE7" delay="-4.4s" />
      <Sparkle className="absolute top-[30%] right-[30%]" size={18} fill="#F966AC" delay="-3.6s" />
      <Dot className="absolute top-[64%] left-[6%]" delay="-1s" />
      <Dot className="absolute top-[6%] right-[38%]" size={12} fill="#7DC4FF" delay="-2.8s" />
      <Dot className="absolute right-[4%] bottom-[34%]" size={12} fill="#FFA620" delay="-0.4s" />
    </div>
  );
}

/* ── viñetas ─────────────────────────────────────────────── */

function Spot({
  children,
  bg = "#F6F4EF",
}: {
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex size-16 items-center justify-center rounded-full md:size-20"
      style={{ background: bg }}
    >
      {children}
    </span>
  );
}

export function MicSpot() {
  return (
    <Spot>
      <HugeiconsIcon icon={Mic01Icon} size={34} color="#4DAFFF" strokeWidth={2.2} />
    </Spot>
  );
}

export function CoinSpot() {
  return (
    <Spot bg="#F2EBE0">
      <HugeiconsIcon icon={Coins01Icon} size={34} color="#B27818" strokeWidth={2.2} />
    </Spot>
  );
}

export function CallSpot() {
  return (
    <Spot>
      <HugeiconsIcon icon={Call02Icon} size={34} color="#44C67F" strokeWidth={2.2} />
    </Spot>
  );
}

export function ShieldSpot() {
  return (
    <Spot bg="#F2EBE0">
      <HugeiconsIcon icon={ShieldCheckIcon} size={34} color="#2f9e63" strokeWidth={2.2} />
    </Spot>
  );
}

/* ── conversación ────────────────────────────────────────── */

function Bar({ className = "", w = "w-32" }: { className?: string; w?: string }) {
  return <div className={`h-3 rounded-full ${w} ${className}`} />;
}

export function ChatArt({ className = "" }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Conversación con Nomik"
      className={`flex aspect-[440/360] flex-col justify-center gap-5 rounded-[40px] bg-[#F6F4EF] p-8 ${className}`}
    >
      <div className="drift-soft flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <HugeiconsIcon icon={UserIcon} size={22} color="#848281" strokeWidth={2} />
        </span>
        <div className="flex flex-col gap-2 rounded-[22px] bg-white px-5 py-4 shadow-sm">
          <Bar className="bg-[#E2D6C5]" w="w-32" />
          <Bar className="bg-[#EFE9DF]" w="w-20" />
        </div>
      </div>
      <div className="drift-soft flex items-center justify-end gap-3" style={{ animationDelay: "-1.6s" }}>
        <div className="flex flex-col gap-2 rounded-[22px] bg-[#7DC4FF] px-5 py-4">
          <Bar className="bg-white/85" w="w-36" />
          <Bar className="bg-white/60" w="w-24" />
        </div>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#4DAFFF] shadow-sm">
          <HugeiconsIcon icon={BotIcon} size={22} color="#FFFFFF" strokeWidth={2} />
        </span>
      </div>
      <div className="drift-soft flex items-center gap-3" style={{ animationDelay: "-3s" }}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <HugeiconsIcon icon={SparklesIcon} size={22} color="#F5B442" strokeWidth={2} />
        </span>
        <div className="flex items-center gap-2 rounded-full bg-white px-5 py-4 shadow-sm">
          <span className="size-2.5 rounded-full bg-[#F5B442]" />
          <span className="size-2.5 rounded-full bg-[#7DC4FF]" />
          <span className="size-2.5 rounded-full bg-[#44C67F]" />
        </div>
      </div>
    </div>
  );
}

/* ── revisión ────────────────────────────────────────────── */

export function ReviewArt({ className = "" }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Revisión antes de actuar"
      className={`flex aspect-[440/360] items-center justify-center rounded-[40px] bg-[#F2EBE0] p-8 ${className}`}
    >
      <div className="drift w-full max-w-[260px] rounded-[28px] bg-white p-6 shadow-[0_10px_30px_rgba(52,52,51,0.10)]">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#44C67F]/15">
          <HugeiconsIcon icon={ShieldCheckIcon} size={30} color="#2f9e63" strokeWidth={2.2} />
        </span>
        <div className="mt-5 flex flex-col gap-3.5">
          {[true, true, false].map((done, i) => (
            <div key={i} className="flex items-center gap-3">
              {done ? (
                <HugeiconsIcon icon={CheckmarkBadge01Icon} size={22} color="#4DAFFF" strokeWidth={2} />
              ) : (
                <span className="size-[22px] rounded-full border-[3px] border-[#E2D6C5]" />
              )}
              <div className={`h-3 rounded-full ${i === 1 ? "w-24" : "w-32"} bg-[#EFE9DF]`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── aparatos ────────────────────────────────────────────── */

export function DevicesArt({ className = "" }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Aparatos conectados"
      className={`relative flex aspect-[440/360] min-w-0 items-center justify-center gap-2 rounded-[40px] bg-[#F6F4EF] p-5 sm:p-8 ${className}`}
    >
      <div className="drift-soft flex size-20 shrink-0 items-center justify-center rounded-[28px] bg-[#7DC4FF] shadow-[0_10px_30px_rgba(77,175,255,0.35)] sm:size-24 sm:rounded-[32px] md:size-32 md:rounded-[36px]">
        <HugeiconsIcon icon={Mic01Icon} size={56} color="#FFFFFF" strokeWidth={1.8} className="size-10 sm:size-11 md:size-14" />
      </div>
      <div className="flex flex-col items-center gap-1 px-1" aria-hidden="true">
        <HugeiconsIcon icon={Wifi01Icon} size={22} color="#B2A79A" strokeWidth={2} />
        <span className="w-10 border-t-4 border-dotted border-[#E2D6C5]" />
      </div>
      <div className="drift-soft flex h-28 w-20 shrink-0 items-center justify-center rounded-[28px] bg-[#5F5DE7] shadow-[0_10px_30px_rgba(95,93,231,0.35)] sm:h-32 sm:w-24 sm:rounded-[32px] md:h-40 md:w-32 md:rounded-[36px]" style={{ animationDelay: "-2.2s" }}>
        <HugeiconsIcon icon={SmartphoneIcon} size={56} color="#FFFFFF" strokeWidth={1.8} className="size-10 sm:size-11 md:size-14" />
      </div>
      <Sparkle className="absolute top-8 right-10" size={20} delay="-1s" />
      <Dot className="absolute bottom-10 left-10" size={12} fill="#F966AC" />
    </div>
  );
}
