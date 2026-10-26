"use client";
/**
 * AuthForm — gestión de sesión en "/" (login + registro) contra el IdP
 * de `api` vía server actions + useActionState (degradación progresiva:
 * el form funciona incluso sin JS).
 */
import { useActionState, useState } from "react";
import { ArrowRight, LoaderCircle, Lock, LogIn, Mail, TriangleAlert, UserPlus } from "lucide-react";
import { loginAction, registerAction } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FormState {
  error?: string;
}

type Mode = "login" | "register";
const INITIAL: FormState = {};

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [loginState, login, loginPending] = useActionState(loginAction, INITIAL);
  const [regState, register, regPending] = useActionState(registerAction, INITIAL);

  const state = mode === "login" ? loginState : regState;
  const pending = mode === "login" ? loginPending : regPending;

  return (
    <Card className="relative w-full max-w-md shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Bienvenido</CardTitle>
        <CardDescription>
          Autenticación contra el IdP de <code className="text-primary">api</code> (Rust
          :8080) · Auth.js v5
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          className="gap-5"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" className="gap-1.5">
              <LogIn className="size-4" />
              Iniciar sesión
            </TabsTrigger>
            <TabsTrigger value="register" className="gap-1.5">
              <UserPlus className="size-4" />
              Crear cuenta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form action={login} className="flex flex-col gap-4" key="login">
              <div className="grid gap-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="tu@correo.dev"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="login-password">Contraseña</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" disabled={pending} className="w-full">
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
                <Label htmlFor="register-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="register-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="tu@correo.dev"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="register-password">
                  Contraseña (mín. 8 caracteres)
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="register-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" disabled={pending} className="w-full">
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
          <Alert variant="destructive" className="mt-4">
            <TriangleAlert />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
