"use client";
import { useTranslations } from "next-intl";

import { Cpu } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSandbox } from "@/lib/viewer/sandbox";

export default function DeviceSelect() {
  const t = useTranslations("panel.device");
  const on = useSandbox();
  if (!on) return null;
  return (
    <Select
      defaultValue="ESP32-S3-Touch-AMOLED-1.43"
    >
      <SelectTrigger
        aria-label={t("label")}
        title={t("label")}
        className="h-8 w-full gap-2 text-xs font-semibold sm:h-9"
      >
        <Cpu className="size-4 shrink-0 text-primary" />
        <SelectValue className="truncate" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ESP32-S3-Touch-AMOLED-1.43">
          ESP32-S3-Touch-AMOLED-1.43
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
