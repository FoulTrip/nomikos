import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/os/device-os";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const snap = await getSnapshot();
  return NextResponse.json(snap);
}