# Progresso — etapas 1 a 6 (concluídas em 2026-10-02, aguardando validação)

Escopo pedido: fazer só as etapas 1–6 e parar para o usuário validar o login e o sync com o Google.

## Feito
- Etapa 1: `docs/ARQUITETURA.md`
- Etapa 2: `wrangler.jsonc`, `open-next.config.ts`, `next.config.ts`, `custom-worker.ts` (Cron Trigger → /api/cron), shadcn/ui (base-nova), `.dev.vars` (secrets aleatórios gerados) + `.dev.vars.example`, scripts no package.json
- Etapa 3: `db/schema.ts` (16 tabelas), `drizzle/0000_inicial.sql` gerada e **aplicada no D1 local**
- Etapa 4: `lib/crypto.ts` (AES-GCM), `lib/auth.ts` (Better Auth + allowlist + criptografia dos tokens), `lib/session.ts`, `app/api/auth/[...all]`, `app/login`
- Etapa 5: `lib/validation.ts` (Zod), `lib/conflicts.ts`, `lib/events-service.ts`, rotas `app/api/events/**`
- Etapa 6: `lib/google/{client,mapping,calendar-sync}.ts`, rotas `app/api/google/{sync,status,webhook}`, `app/api/cron`
- UI de validação: `app/agenda` + `components/agenda/*`

## Concluído em 2026-10-02 (2ª sessão)
- `server-only` instalado; `next typegen` gerou `LayoutProps`/`PageProps` → `tsc --noEmit` limpo
- `npm run lint` limpo (0 avisos)
- Vitest: `vitest.config.mts` + `tests/{conflicts,mapping,crypto,time}.test.ts` → 35 testes passando
- `next dev` testado: rotas protegidas redirecionam/401, `/api/cron` sem token = 401, login monta a URL do Google com `calendar.events` + `tasks` + `access_type=offline`
- README com setup local, Google Cloud Console, comandos wrangler e checklist "como testar"
- O `next dev` gerou `AGENTS.md`/`CLAUDE.md` na raiz (regras do Next 16 para agentes)

## Mudança de rumo (2026-10-04): login por e-mail + senha, Google como integração
- Etapa 0 (verificações): ver memória/README. D1 remoto `agenda-db` ainda NÃO existe (database_id zerado).
- `lib/password.ts`: hash PBKDF2-SHA256 (100k iterações, limite do Workers) plugado no Better Auth `emailAndPassword`
- `lib/auth.ts`: sem socialProviders; cadastro só para `ALLOWED_EMAILS` (hook user.create), senha 10–128
- Tabela `google_connections` + migração `drizzle/0001_google_connections.sql` (aplicada no D1 local)
- `lib/google/oauth.ts` (state + PKCE em cookie httpOnly cifrado; troca de conta Google refaz os vínculos)
- Rotas `/api/google/{connect,callback,disconnect}`; `client.ts`/`cron`/`status`/`sync` leem `google_connections`
- `invalid_grant` marca a conexão como `revoked` (a UI pede para reconectar)
- Sem Google conectado, eventos ficam `pending` sem erro (pushEvent → `not_connected`)
- UI: `/login` (entrar / criar conta), `/configuracoes` (conectar/desconectar), aviso na agenda
- Verificado: tsc, lint, 39 testes; `next dev` + curl (cadastro bloqueado fora da allowlist, senha curta,
  login ok/errado, connect monta URL com PKCE, callback com state falso recusado, evento sem Google = pending).
  Dados de teste apagados do D1 local.

## Etapa 7 — interface base (2026-10-04, aguardando teste)
Login + conexão + sync com o Google validados pelo usuário antes de começar.
- `lib/nlp/parse-pt.ts`: criação rápida em pt-BR. Regras próprias para horas ("15h", "12h30", "às 6", "8 da noite",
  "das 14h às 16h"), durações ("por 1h30", "por meia hora"), datas relativas (hoje/amanhã/depois de amanhã/dia 12/
  próxima terça/daqui a 3 dias), recorrência (seg, qua e sex / toda terça / às terças / dias úteis / todo dia 10 /
  todo mês) e prioridade (urgente/importante); chrono-node **pt** (só o locale) para datas explícitas (15/10, 10 de novembro)
- `lib/recurrence.ts`: séries expandidas no **fuso do evento** (antes era UTC: 22h de segunda virava terça)
- Categorias: `lib/categories-service.ts` + `/api/categories[/id]`; 5 padrão criadas no 1º acesso (uma vez só);
  dono da categoria validado ao salvar evento
- UI: `components/agenda/` → `agenda-client` (orquestra), `time-grid` (Hoje/Semana, sobreposições lado a lado, linha
  de agora), `month-view`, `list-view`, `quick-add`, `filters`, `view-utils` (intervalos/navegação/filtros, puro);
  `event-form` com categoria e seletor de dias da semana. `week-grid.tsx` removido.
- Visão lembrada em cookie `agenda_view` (lido no servidor) + `?v=&d=` na URL
- Configurações: gestão de categorias + painel técnico de sync (saiu da tela da agenda)
- Verificado: tsc, lint, **74 testes** (33 do parser, 2 de recorrência no fuso); no navegador (sessão do usuário,
  sem salvar nada): as 4 visões, filtros, categorias, e "academia seg, qua e sex 6h" preenchendo o formulário certo

## Etapa 7 aprovada (2026-10-04) — semana começa na segunda-feira (decisão do usuário)

## Git / GitHub (2026-10-04)
- Repositório: https://github.com/Sonay-dev/AgendaInteligente (**público**, a pedido do usuário), branch `main`
- `.gitignore` cobre `.dev.vars*` (exceto `.example`), `.env*`, `.wrangler`, `node_modules`, `.next`; `.gitattributes` força LF
- Nunca commitar segredos: local em `.dev.vars`, produção em `wrangler secret put`

## Etapa 8 — 8A e 8B (2026-10-05, aguardando teste); 8C depois
Escopo pedido: 8A e 8B primeiro e parar. Google Tasks **desligado** (tarefas só locais; `sync_status` fica "pending"
para subir tudo quando a Tasks API for ativada).
- Navegação inferior comum (grupo de rotas `app/(app)/`, `components/app-nav.tsx`): Agenda · Tarefas (contador vermelho
  de atrasadas) · Caixa (contador de itens) · Ajustes. `GET /api/counts`.
- **8A Caixa de entrada** (`/caixa-de-entrada`): captura digitada ou **ditada em pt-BR** (Web Speech API,
  `components/inbox/use-dictation.ts`; Chrome/Edge/Safari; no Chrome o áudio passa pelos servidores do Google);
  editar/descartar itens; **Triagem** um item por vez (mais antigo primeiro): Compromisso (formulário da agenda
  preenchido pelo parser, com aviso de conflito) · Tarefa (formulário de tarefa preenchido) · Descartar · Pular.
  API: `/api/inbox`, `/api/inbox/[id]` (PATCH texto, DELETE = descartar), `/api/inbox/[id]/triage`
  (tarefa + item processado no mesmo lote).
- **8B Tarefas** (`/tarefas`): abas Abertas / Aguardando / Concluídas (30 dias); Abertas agrupadas em Atrasadas
  (vermelho) · Hoje · Amanhã · Próximos 7 dias · Depois · Sem data, ordenadas por prioridade e prazo; criação rápida
  pelo parser (cria direto, toast com "Editar"); P1/P2/P3; prazo com hora opcional; status "aguardando" com
  "quem", dias sem retorno (âmbar ≥3, vermelho ≥7) e botão "Cobrei"; **checklist** (salvo na hora em tarefas
  existentes); filtros por prioridade/categoria e busca; concluir com "Desfazer".
  API: `/api/tasks`, `/api/tasks/[id]`, `/api/tasks/[id]/subtasks[/subId]`.
- Regras puras em `lib/tasks-logic.ts` (atraso no fuso do usuário, agrupamento, efeitos de status, rascunho a partir
  do texto); serviços `lib/tasks-service.ts` e `lib/inbox-service.ts`. Parser aprendeu "ontem"/"anteontem".
- Verificado: tsc, lint, **87 testes** (12 de tarefas). No navegador (sessão do usuário): captura → triagem → tarefa
  com checklist; atrasada em vermelho + contador; aguardando com "Cobrei". Itens de teste apagados depois.
  **Não testado:** o ditado por voz (precisa de microfone/permissão — testar no celular).

## Etapa 8C — lembretes escalonados com Web Push (2026-10-05, aguardando teste)
- Web Push sem dependências, só Web Crypto (roda no Workers): `lib/push/webpush.ts` — aes128gcm (RFC 8291,
  conferido byte a byte com o exemplo do Apêndice A) + VAPID ES256 (RFC 8292). Chaves em `.dev.vars`
  (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); produção: `wrangler secret put` das três.
- Escalonamento puro em `lib/reminders/schedule.ts` (tabela em Configurações → Notificações):
  compromissos usam os lembretes do evento (P1 1 dia/1 h/10 min · P2 1 h/10 min · P3 10 min; dia inteiro 08:00,
  P1 também véspera 18:00); tarefas com prazo: P1 véspera + 1 h + 10 min + na hora + cobrança diária 08:00 por até
  7 dias · P2 1 h + 10 min + na hora + 1 cobrança · P3 10 min (dia inteiro: 08:00 do dia).
- Motor `lib/reminders/engine.ts` no cron de 5 min: janela de envio −30 min/+2,5 min; registra em
  `notification_log` antes de enviar (no máximo uma vez); se vários avisos do mesmo item venceram juntos, manda só
  o mais recente; até 8 por execução; assinatura que o serviço de push dá como encerrada é apagada.
- Ações na notificação: **Concluir** (não aparece em séries recorrentes) e **Adiar 15 min** (tabela nova
  `scheduled_notifications`, migração `0002_lembretes_adiados.sql`). Autenticadas por token HMAC assinado com
  `AUTH_SECRET` (expira em 3 dias) → funciona mesmo com a sessão expirada. `POST /api/notifications/action`.
- `public/sw.js` (P1 fica na tela até tocar; toque abre o app no dia/tarefas), `app/manifest.ts` + ícones em
  `public/icons/` (PWA instalável; no iPhone push só com o app na Tela de Início, iOS 16.4+), cabeçalhos de segurança
  e do `/sw.js` no `next.config.ts`.
- API: `/api/push/subscribe` (POST/DELETE; só serviços de push conhecidos: FCM, Mozilla, Windows, Apple),
  `/api/push/test`, `/api/push/devices`. Configurações → Notificações: ativar/testar/desativar neste aparelho.
- Verificado: tsc, lint, **103 testes** (escalonamento, RFC 8291, VAPID, token). E2E local com dados temporários
  (apagados): cron pegou o aviso da tarefa, registrou e enviou ao FCM; inscrição falsa recusada pelo FCM foi apagada
  sozinha; sem reenvio na execução seguinte; Adiar criou o agendamento; token adulterado → 401; Concluir concluiu.
  **Não testado:** a notificação chegando de verdade num aparelho (precisa da permissão do usuário).
- Atenção: com o Google conectado, o Google Calendar também avisa os compromissos (lembretes "popup" do evento) →
  pode haver aviso duplicado no celular.

## Aguardando o usuário
Testar a 8C (checklist "Notificações (etapa 8C)" na seção 5 do README): ativar num aparelho, "Enviar teste",
e um compromisso/tarefa real para ver o lembrete com Concluir/Adiar.
Pendências conhecidas: D1 remoto `agenda-db` ainda não criado; secrets VAPID ainda não enviados para produção.

## Ambiente
- Node 24.21 LTS instalado no sistema (2026-10-04): `npm`, `npx wrangler` e `vitest` funcionam direto.
