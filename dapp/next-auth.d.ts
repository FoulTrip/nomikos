/**
 * next-auth.d.ts — augmentación de tipos de Auth.js v5.
 *
 * El Bearer del IdP (`api`) y el account_id viajan como claims del JWT
 * y quedan expuestos en la Session (cookie cifrada HTTP-Only).
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** Token opaco emitido por api — reenviar como `Authorization: Bearer`. */
    accessToken?: string;
    accountId?: string;
    expiresAt?: number;
  }

  interface User {
    accountId?: string;
    accessToken?: string;
    expiresAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    accountId?: string;
    expiresAt?: number;
  }
}
