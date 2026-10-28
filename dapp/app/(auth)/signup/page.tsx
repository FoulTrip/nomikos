import AuthForm from "@/components/AuthForm";

export const metadata = {
  title: "Crear cuenta | NomikOS",
  description: "Registro en NomikOS — alta en el IdP de api.",
};

export default function SignUpPage() {
  return <AuthForm mode="register" />;
}
