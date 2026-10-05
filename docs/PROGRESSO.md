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

## Aguardando o usuário
Testar a etapa 7 (checklist "Interface base" na seção 5 do README). Só depois seguir para a etapa 8.
Pendências conhecidas: D1 remoto `agenda-db` ainda não criado; semana começa na segunda (trocar para domingo se preferir).

## Ambiente
- Node 24.21 LTS instalado no sistema (2026-10-04): `npm`, `npx wrangler` e `vitest` funcionam direto.
