import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Política de privacidade · Agenda Sonay" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" updated="5 de outubro de 2026">
      <p>
        A Agenda Sonay é um aplicativo de <strong>uso pessoal</strong>, feito para organizar a agenda e as tarefas do
        próprio usuário. Esta página explica, de forma simples, como os dados são tratados.
      </p>

      <h2>Google Calendar</h2>
      <p>
        Se você conectar sua conta Google, o app usa o Google Calendar <strong>apenas</strong> para criar, editar e ler
        os seus próprios compromissos. Nenhum outro dado da sua conta Google é acessado.
      </p>

      <h2>Segurança</h2>
      <p>
        Os tokens de acesso ao Google ficam guardados <strong>criptografados</strong>. A senha da sua conta no app é
        armazenada apenas como hash, nunca em texto puro.
      </p>

      <h2>Compartilhamento</h2>
      <p>Nenhum dado é vendido ou compartilhado com terceiros.</p>

      <h2>Como desconectar</h2>
      <ul>
        <li>
          No app, você pode desconectar o Google a qualquer momento em <a href="/configuracoes">Configurações</a>.
        </li>
        <li>
          Você também pode revogar o acesso direto na sua conta Google, em{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </li>
      </ul>

      <h2>Contato</h2>
      <p>
        Dúvidas sobre privacidade: <a href="mailto:sonaydev88@gmail.com">sonaydev88@gmail.com</a>.
      </p>
    </LegalPage>
  );
}
