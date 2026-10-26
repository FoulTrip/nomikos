import { NextResponse } from "next/server";
import { tap } from "@/lib/os/device-os";

export const dynamic = "force-dynamic";

export async function POST() {
  await tap(); // alterna app home ⇄ agent en el singleton del servidor
  // el cliente ya refresca el estado tras el POST (tapScreen en lib/os/store)
  return NextResponse.json({ ok: true });
}
