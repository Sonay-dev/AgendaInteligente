import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Política de privacidade · Agenda Sonay" };

const CONTACT = "sonaydev88@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" updated="6 de outubro de 2026">
      <p>
        A Agenda Sonay é uma agenda e lista de tarefas de <strong>uso pessoal</strong>. Esta política explica quais dados o
        app trata, para quê, onde ficam e como você pode removê-los.
      </p>

      <h2>Responsável</h2>
      <p>
        O app é mantido por Sonay. Para qualquer assunto sobre privacidade, escreva para{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>Dados coletados</h2>
      <ul>
        <li>
          <strong>Conta:</strong> nome e e-mail. A senha é guardada somente como hash (PBKDF2), nunca em texto puro.
        </li>
        <li>
          <strong>Conteúdo que você cria no app:</strong> compromissos, tarefas, itens da caixa de entrada e categorias.
        </li>
        <li>
          <strong>Integração com o Google (opcional):</strong> os tokens de acesso do Google e o e-mail da conta Google
          conectada.
        </li>
        <li>
          <strong>Dados técnicos:</strong> endereço IP e navegador de cada sessão (para segurança do login) e, se você ativar
          as notificações, o endereço de entrega das notificações do seu aparelho.
        </li>
      </ul>

      <h2>Acesso ao Google e escopo usado</h2>
      <p>
        Ao conectar o Google Calendar, o app pede o escopo{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-sm">https://www.googleapis.com/auth/calendar.events</code>. Ele
        serve para criar, atualizar, excluir e ler os compromissos da sua agenda principal e configurar os lembretes deles,
        mantendo a agenda do app e a do Google sincronizadas. Também são pedidos os escopos básicos <code className="rounded bg-muted px-1 py-0.5 text-sm">openid</code> e{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-sm">email</code>, usados apenas para mostrar qual conta Google
        está conectada. O app não acessa outros dados da sua conta Google.
      </p>
      <p>
        O uso e a transferência de informações recebidas das APIs do Google para qualquer outro app seguirão a{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Política de Dados do Usuário dos Serviços de API do Google
        </a>
        , incluindo os requisitos de Uso Limitado.
      </p>

      <h2>Como os dados são usados</h2>
      <p>
        Somente para as funções do app: mostrar e sincronizar sua agenda, organizar suas tarefas, enviar os lembretes que
        você configurou e manter sua conta segura. Os dados não são usados para publicidade nem para criar perfis.
      </p>

      <h2>Armazenamento e segurança</h2>
      <p>
        Os dados ficam na infraestrutura da Cloudflare (Workers e banco de dados D1). Toda a comunicação usa HTTPS. Os tokens
        de acesso do Google são guardados <strong>criptografados com AES-GCM</strong>.
      </p>

      <h2>Retenção</h2>
      <ul>
        <li>Os dados são mantidos enquanto a sua conta existir.</li>
        <li>
          Ao desconectar o Google, o acesso é revogado junto ao Google e os tokens são apagados na hora. Os compromissos já
          sincronizados continuam no app e no seu Google Calendar.
        </li>
        <li>As sessões de login expiram após 30 dias sem uso.</li>
        <li>Se você pedir a exclusão, a conta e todos os dados dela são apagados em até 30 dias.</li>
      </ul>

      <h2>Compartilhamento</h2>
      <p>
        <strong>Nenhum.</strong> Não vendemos nem compartilhamos seus dados com terceiros.
      </p>

      <h2>Como desconectar e revogar o acesso</h2>
      <ul>
        <li>
          No app, em <a href="/configuracoes">Configurações</a>, use “Desconectar” na seção do Google Calendar.
        </li>
        <li>
          Na sua conta Google, você também pode revogar o acesso em{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            https://myaccount.google.com/permissions
          </a>
          .
        </li>
      </ul>

      <h2>Exclusão dos dados</h2>
      <p>
        Para apagar sua conta e todos os seus dados, envie um e-mail para <a href={`mailto:${CONTACT}`}>{CONTACT}</a> a partir
        do e-mail cadastrado. A exclusão é feita em até 30 dias e confirmada por e-mail.
      </p>

      <h2>Ditado por voz</h2>
      <p>
        O ditado da caixa de entrada usa o reconhecimento de voz do próprio navegador. No Chrome, o áudio é processado pelo
        Google conforme a política do navegador; o app recebe apenas o texto.
      </p>

      <h2>Alterações</h2>
      <p>Se esta política mudar, a data de atualização no topo da página será alterada.</p>
    </LegalPage>
  );
}
