import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Solo para el conmutador de idioma de la landing. Las rutas de la app
// (/signin, /signup, /panel) usan next/link plano: no están localizadas.
export const { Link, usePathname } = createNavigation(routing);
