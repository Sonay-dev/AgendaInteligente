import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Termos de uso · Agenda Sonay" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updated="5 de outubro de 2026">
      <p>
        A Agenda Sonay é um aplicativo de <strong>uso pessoal</strong> para organizar compromissos, tarefas e lembretes.
        O acesso é restrito a contas autorizadas.
      </p>

      <h2>Uso</h2>
      <ul>
        <li>Você é responsável por manter sua senha em segredo e pelas informações que cadastra no app.</li>
        <li>A conexão com o Google Calendar é opcional e pode ser desfeita a qualquer momento em Configurações.</li>
      </ul>

      <h2>Disponibilidade</h2>
      <p>
        O app é oferecido como está, sem garantia de funcionamento contínuo. Lembretes e sincronização podem atrasar ou
        falhar por problemas de rede ou de serviços externos; não use o app como única fonte para compromissos críticos.
      </p>

      <h2>Privacidade</h2>
      <p>
        O tratamento dos dados está descrito na <a href="/privacidade">Política de privacidade</a>.
      </p>

      <h2>Contato</h2>
      <p>
        <a href="mailto:sonaydev88@gmail.com">sonaydev88@gmail.com</a>
      </p>
    </LegalPage>
  );
}
