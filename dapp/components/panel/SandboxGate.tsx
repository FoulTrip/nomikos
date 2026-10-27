"use client";

import { useSandbox } from "@/lib/viewer/sandbox";
import Dashboard from "./Dashboard";

export default function SandboxGate({ children }: { children: React.ReactNode }) {
  const on = useSandbox();
  if (on) return <>{children}</>;
  return <Dashboard />;
}
