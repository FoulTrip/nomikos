"use client";
/**
 * AuthForm — gestión de sesión (/signin + /signup) contra el IdP
 * de `api` vía server actions + useActionState (degradación progresiva:
 * el form funciona incluso sin JS). Estilo cálido de la landing.
 */
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Lock, LogIn, Mail, TriangleAlert, UserPlus } from "lucide-react";
import { loginAction, registerAction } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FormState {
  error?: string;
}

type Mode = "login" | "register";
const INITIAL: FormState = {};
const DEFAULT_EMAIL = "davidvasquezmahecha@gmail.com";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [loginState, login, loginPending] = useActionState(loginAction, INITIAL);
  const [regState, register, regPending] = useActionState(registerAction, INITIAL);

  const state = mode === "login" ? loginState : regState;
  const pending = mode === "login" ? loginPending : regPending;

  return (
    <div className="relative w-full max-w-md rounded-[32px] border border-[#EDEDED] bg-white p-6 shadow-[0_3px_16px_rgba(0,0,0,0.06)] sm:p-8">
      <Tabs
        value={mode}
        onValueChange={(v) => router.push(v === "login" ? "/signin" : "/signup")}
        className="gap-5"
      >
        <TabsList className="grid w-full grid-cols-2 rounded-full bg-[#F6F4EF] p-1">
          <TabsTrigger value="login" className="gap-1.5 rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <LogIn className="size-4" />
            Iniciar sesión
          </TabsTrigger>
          <TabsTrigger value="register" className="gap-1.5 rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <UserPlus className="size-4" />
            Crear cuenta
          </TabsTrigger>
        </TabsList>

        <TabsContent value="login">
          <form action={login} className="flex flex-col gap-4" key="login">
            <div className="grid gap-2">
              <Label htmlFor="login-email" className="sr-only">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={DEFAULT_EMAIL}
                  className="h-12 rounded-2xl bg-white pl-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password" className="sr-only">Contraseña</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="current-password"
                  className="h-12 rounded-2xl bg-white pl-10"
                />
              </div>
            </div>
            <Button type="submit" disabled={pending} className="lift h-12 w-full rounded-full text-[15px]">
              {loginPending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Verificando…
                </>
              ) : (
                <>
                  Entrar al panel
                  <ArrowRight />
                </>
              )}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="register">
          <form action={register} className="flex flex-col gap-4" key="register">
            <div className="grid gap-2">
              <Label htmlFor="register-email" className="sr-only">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="register-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="h-12 rounded-2xl bg-white pl-10"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="register-password" className="sr-only">
                Contraseña (mín. 8 caracteres)
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="register-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="h-12 rounded-2xl bg-white pl-10"
                />
              </div>
            </div>
            <Button type="submit" disabled={pending} className="lift h-12 w-full rounded-full text-[15px]">
              {regPending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Creando cuenta…
                </>
              ) : (
                <>
                  Crear cuenta y entrar
                  <ArrowRight />
                </>
              )}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {state?.error && (
        <Alert variant="destructive" className="mt-4 rounded-2xl">
          <TriangleAlert />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
