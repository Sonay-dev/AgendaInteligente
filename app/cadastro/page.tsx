import { redirect } from "next/navigation";

// Endereço amigável para "Criar conta": abre a tela de login já no modo de cadastro.
export default function SignUpPage() {
  redirect("/login?modo=criar");
}
