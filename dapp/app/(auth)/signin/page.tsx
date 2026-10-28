import AuthForm from "@/components/AuthForm";

export const metadata = {
  title: "Iniciar sesión | NomikOS",
  description: "Acceso a NomikOS — Auth.js v5 contra el IdP de api.",
};

export default function SignInPage() {
  return <AuthForm mode="login" />;
}
