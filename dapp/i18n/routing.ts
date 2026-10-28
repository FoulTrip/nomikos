import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Solo la landing (/) está localizada; el resto de la app queda en español
  locales: ["es", "en"],
  defaultLocale: "es",
  // as-needed: español sin prefijo (/), inglés con prefijo (/en)
  localePrefix: "as-needed",
});
