# Agenda Inteligente — Sonay

Agenda pessoal com sincronização bidirecional com o Google Calendar.
Next.js 16 rodando em Cloudflare Workers (OpenNext), D1 + Drizzle, Better Auth (login com e-mail e senha).
A conexão com o Google Calendar/Tarefas é opcional e separada do login (tela **Configurações**).

Arquitetura e decisões: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · Andamento: [`docs/PROGRESSO.md`](docs/PROGRESSO.md)

## Requisitos

- **Node.js 22 ou mais novo** (recomendado: Node 24 LTS). O `wrangler` e o `vitest` não rodam no Node 20.
- Conta Google e um projeto no Google Cloud Console (só para a integração com o Google Calendar).
- Conta Cloudflare (só para o deploy).

## 1. Google Cloud Console

1. Crie um projeto em <https://console.cloud.google.com>.
2. **APIs e serviços → Biblioteca**: ative a **Google Calendar API** e a **Google Tasks API**.
3. **Tela de consentimento OAuth**: tipo *Externo*, status *Teste*, e adicione seu e-mail em **Usuários de teste**.
   Escopos usados: `openid`, `email`, `calendar.events`, `tasks`.
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**:
   - Origens JavaScript autorizadas: `http://localhost:3000` e `https://agenda.sonaydev.com`
   - URIs de redirecionamento autorizados:
     - `http://localhost:3000/api/google/callback`
     - `https://agenda.sonaydev.com/api/google/callback`
5. Copie o *Client ID* e o *Client secret*.

> Em modo *Teste*, o Google expira o refresh token após 7 dias. Para uso contínuo, publique o app
> (para uso pessoal não é preciso passar pela verificação; o Google só mostra um aviso ao conectar).
> Se o refresh token expirar, o app marca a conexão como "revogada" e pede para reconectar em Configurações.

## 2. Rodando localmente

```bash
npm install
cp .dev.vars.example .dev.vars        # preencha os valores (veja abaixo)
npm run db:migrate:local              # cria as tabelas no D1 local (.wrangler/)
npm run dev                           # http://localhost:3000
```

Variáveis do `.dev.vars`:

| Nome | O que é |
| --- | --- |
| `APP_URL` | `http://localhost:3000` no local |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | credenciais do passo 1 |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | 32 bytes em base64 — criptografa os tokens do Google (`openssl rand -base64 32`) |
| `CRON_SECRET` | protege a rota interna `/api/cron` (`openssl rand -hex 24`) |
| `ALLOWED_EMAILS` | e-mails que podem criar conta e entrar, separados por vírgula |
| `VAPID_*` | só na etapa 8 (notificações push) |

## 3. Scripts

| Comando | Faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento (com bindings do D1 local) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | testes Vitest (`tests/`) |
| `npm run db:generate` | gera migração em `drizzle/` a partir de `db/schema.ts` |
| `npm run db:migrate:local` / `db:migrate:remote` | aplica migrações no D1 local / de produção |
| `npm run preview` | build do OpenNext + Worker local (mais próximo da produção) |
| `npm run deploy` | build + deploy na Cloudflare |
| `npm run cf-typegen` | regenera `cloudflare-env.d.ts` a partir do `wrangler.jsonc` |

## 4. Deploy na Cloudflare

```bash
npx wrangler login
npx wrangler d1 create agenda-db            # cole o database_id no wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put GOOGLE_CLIENT_ID     # repita para GOOGLE_CLIENT_SECRET, AUTH_SECRET,
                                             # ENCRYPTION_KEY, CRON_SECRET, ALLOWED_EMAILS
npm run deploy
```

O Cron Trigger (`*/5 * * * *`) chama `/api/cron`: reenvia alterações pendentes ao Google e renova o canal
`events.watch`. O push do Google (`/api/google/webhook`) só funciona com HTTPS público — no local ele é
ignorado e a sincronização acontece pelo botão "Sincronizar" ou pelo cron.

## 5. Como testar (etapas 1–8B)

**Automático**

- [ ] `npm run typecheck`, `npm run lint` e `npm test` sem erros (87 testes: parser de linguagem natural, regras de tarefas, conflitos e recorrência no fuso,
      mapeamento App ⇄ Google, regra "última alteração vence", backoff, criptografia, hash de senha, fusos/dia inteiro).

**Login com e-mail e senha (etapa 4)**

- [ ] `/` sem sessão redireciona para `/login`.
- [ ] "Primeiro acesso? Criar conta" com um e-mail de `ALLOWED_EMAILS` e senha de 10+ caracteres → entra em `/agenda`.
- [ ] Um e-mail fora de `ALLOWED_EMAILS` é recusado ("Este e-mail não está autorizado").
- [ ] Senha errada mostra "E-mail ou senha incorretos".
- [ ] A senha fica só como hash PBKDF2:
      `npx wrangler d1 execute agenda-db --local --command "select provider_id, substr(password,1,22) from accounts"`
      → `credential | pbkdf2:sha256:100000:…`
- [ ] "Sair" encerra a sessão e volta para `/login`.

**Integração com o Google (Configurações)**

- [ ] Sem o Google conectado, a agenda funciona normal e mostra o aviso "Google Calendar não conectado"; os compromissos
      ficam "pendentes" sem erro.
- [ ] Em `/configuracoes` → "Conectar Google" → tela do Google (Agenda e Tarefas) → volta com "Google conectado".
- [ ] Os pendentes sobem para o Google logo após conectar.
- [ ] Os tokens ficam criptografados (começam com `enc:v1:`):
      `npx wrangler d1 execute agenda-db --local --command "select google_email, status, substr(access_token,1,7), substr(refresh_token,1,7) from google_connections"`
- [ ] Cancelar na tela do Google volta para Configurações com "Você cancelou a conexão".
- [ ] "Desconectar" revoga o acesso (some em <https://myaccount.google.com/permissions>) e a agenda continua com os eventos.

**Eventos (etapa 5)**

- [ ] Criar, editar, concluir, duplicar e excluir um compromisso em `/agenda`.
- [ ] Criar um compromisso sobreposto a outro mostra o aviso de conflito (encostado, ex.: 10–11 e 11–12, não conflita).
- [ ] Sem sessão, `GET /api/events` responde 401.

**Sincronização com o Google (etapa 6)**

- [ ] Criado no app → aparece no Google Calendar (cor azul se for foco; "✅" no título quando concluído).
- [ ] Criado/alterado no Google → aparece no app após "Sincronizar" (ou em até 5 min em produção).
- [ ] Excluído no Google → some do app; excluído no app → some do Google.
- [ ] Editar o mesmo evento nos dois lados: vence a alteração mais recente (registrada em `audit_log`).
- [ ] Com a internet cortada, a alteração fica "pendente" e é reenviada depois (`/api/google/status` mostra a fila).
- [ ] `POST /api/cron` sem `Authorization: Bearer $CRON_SECRET` responde 401.

**Interface base (etapa 7)**

- [ ] Abas **Hoje / Semana / Mês / Lista**; setas avançam/voltam; "Hoje" aparece quando você sai do período atual.
      A visão escolhida fica lembrada (cookie) e a URL guarda visão + data (`/agenda?v=semana&d=2026-10-05`).
- [ ] Hoje/Semana: toque num horário vazio cria naquele horário; arrastar move (séries recorrentes: só pelo formulário);
      linha vermelha marca a hora atual. Mês: toque no dia abre a visão do dia.
- [ ] Criação rápida (campo no topo): ao digitar aparecem os chips do que foi entendido; Enter abre o formulário
      preenchido para confirmar. Experimente:
  - `reunião com João amanhã às 15h por 1h` → amanhã 15:00–16:00
  - `academia seg, qua e sex 6h` → 06:00–07:00, repetição "Dias da semana" S·Q·S
  - `dentista dia 12 às 9:30`, `almoço sexta 12h30`, `consulta 15/10 14h`, `inglês toda terça 19h`,
    `stand-up dias úteis 9h por 15 min`, `pagar cartão todo dia 10`, `enviar proposta urgente amanhã 9h`
- [ ] Categorias com cores (Configurações → Categorias: criar, renomear, trocar cor, excluir); a cor aparece nos eventos.
- [ ] Filtros: categoria, P1/P2/P3, "Ocultar concluídos" e busca; "Limpar" zera tudo.
- [ ] Salvar um horário sobreposto mostra o aviso de conflito com "Salvar mesmo assim".
- [ ] Estados: esqueleto ao carregar; erro com "Tentar de novo" (ex.: pare o `npm run dev` e troque de semana); vazio com
      atalho para criar.

**Caixa de entrada e tarefas (etapas 8A e 8B)**

- [ ] A barra inferior leva a Agenda, Tarefas, Caixa e Ajustes; Caixa mostra quantos itens faltam triar e Tarefas
      mostra (em vermelho) quantas estão atrasadas.
- [ ] Caixa: digite e Enter guarda; o microfone dita em português (o navegador pede permissão; no Chrome o áudio é
      processado pelo Google). Itens podem ser editados ou descartados.
- [ ] "Triagem": um item por vez → Compromisso (formulário da agenda já preenchido, com aviso de conflito),
      Tarefa (formulário de tarefa preenchido), Descartar ou Pular. A caixa esvazia e o contador some.
- [ ] Tarefas: digite `enviar proposta urgente amanhã 9h` → cria P1 para amanhã 09:00. Uma tarefa com prazo vencido
      (ex.: `relatório ontem`) aparece em "Atrasadas", em vermelho.
- [ ] Abra uma tarefa: checklist (adicionar, marcar, remover, salvo na hora), status "Aguardando" + "Aguardando quem?";
      na aba Aguardando aparecem os dias sem retorno e o botão "Cobrei" (zera a contagem).
- [ ] Concluir mostra "Desfazer"; concluídas ficam 30 dias na aba Concluídas e podem ser reabertas.
- [ ] As tarefas NÃO vão para o Google Tasks ainda (sincronização desligada de propósito).

