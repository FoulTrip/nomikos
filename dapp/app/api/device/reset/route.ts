import { NextResponse } from "next/server";
import { resetOS } from "@/lib/os/device-os";

export const dynamic = "force-dynamic";

export async function POST() {
  await resetOS();
  return NextResponse.json({ ok: true, bootProgress: 0 });
}
