# Agenda Inteligente — Arquitetura (Etapa 1)

## Visão geral

```
 Celular / Desktop (PWA, Next.js App Router, React 19, Tailwind + shadcn/ui)
        │  cookie httpOnly (Better Auth)
        ▼
 Cloudflare Worker  (Next.js via @opennextjs/cloudflare, nodejs_compat)
   ├─ /api/auth/*            Better Auth (e-mail + senha PBKDF2, allowlist ALLOWED_EMAILS)
   ├─ /api/google/connect    OAuth do Google só para a integração (state + PKCE)
   ├─ /api/google/callback   guarda os tokens criptografados em google_connections
   ├─ /api/google/disconnect revoga e para a sincronização
   ├─ /api/events[...]       CRUD + Zod + detecção de conflito
   ├─ /api/categories[...]   categorias com cor (padrão criadas no 1º acesso)
   ├─ /api/google/sync       Google → App incremental (syncToken)
   ├─ /api/google/webhook    events.watch (push do Google)
   ├─ /api/cron              chamado pelo Cron Trigger (custom-worker.ts → scheduled)
   │                           • reenvia itens sync_status=pending (backoff exponencial)
   │                           • renova o canal events.watch antes de expirar
   │                           • sync incremental de segurança
   ├─ D1 (SQLite)   ← Drizzle ORM + migrations versionadas em /drizzle
   └─ Web Crypto    ← AES-GCM dos tokens Google (ENCRYPTION_KEY)
        │
        ▼
 Google Calendar API (primary)  ·  Google Tasks API (etapa 8B)
```

### Decisões
| Tema | Decisão | Por quê |
|---|---|---|
| Runtime | Cloudflare Workers (plano free) via OpenNext | pedido; custo zero |
| Cache do Next | sem R2/incremental cache | app 100% dinâmico; R2 exige cartão |
| Banco | D1 + Drizzle (`sqlite`), datas como **TEXT ISO 8601 UTC** | restrição do projeto |
| Auth | Better Auth + Drizzle adapter (`usePlural`: users/sessions/accounts/verifications) | cookie httpOnly, roda no Workers |
| Tokens Google | `databaseHooks.account.*.before` criptografa com AES-GCM; só o servidor descriptografa | nunca expor ao cliente |
| Allowlist | checada ao criar usuário **e** ao criar sessão | app pessoal |
| Fonte da verdade | o app; Google é espelho. Conflitos: "última alteração vence" (`updated_at` × `updated` do Google) + `audit_log` | pedido |
| Resiliência | gravação local primeiro (`sync_status=pending`), push imediato com retry/backoff; o cron reenvia | nada se perde |
| Cron | um único Cron Trigger `*/5 * * * *` (free permite até 5) | também servirá aos lembretes da etapa 8 |
| Dia inteiro | `start_at` = meia-noite local (no fuso do evento) em UTC; `end_at` exclusivo (dia seguinte), igual ao Google | trata horário de verão |

## Árvore de pastas

```
agenda/
├─ app/
│  ├─ layout.tsx, page.tsx, globals.css
│  ├─ login/page.tsx                 # e-mail + senha (entrar / criar conta)
│  ├─ configuracoes/page.tsx         # conectar/desconectar Google
│  ├─ agenda/page.tsx                # Hoje/Semana/Mês/Lista + criação rápida + filtros
│  └─ api/
│     ├─ auth/[...all]/route.ts      # Better Auth
│     ├─ events/route.ts             # GET (intervalo) / POST
│     ├─ events/[id]/route.ts        # GET / PATCH / DELETE (soft)
│     ├─ events/[id]/duplicate/route.ts
│     ├─ events/conflicts/route.ts   # checagem prévia
│     ├─ google/sync/route.ts        # Google → App sob demanda
│     ├─ google/webhook/route.ts     # events.watch
│     └─ cron/route.ts               # chamado pelo scheduled()
├─ components/                       # ui/ (shadcn) + componentes do app
├─ db/
│  ├─ schema.ts                      # schema Drizzle completo
│  └─ index.ts                       # getDb()
├─ drizzle/                          # migrations SQL versionadas (drizzle-kit generate)
├─ lib/
│  ├─ auth.ts / auth-client.ts       # Better Auth (servidor / cliente)
│  ├─ crypto.ts                      # AES-GCM (Web Crypto)
│  ├─ env.ts                         # acesso tipado aos bindings/secrets
│  ├─ session.ts                     # requireUser() nas rotas
│  ├─ validation.ts                  # schemas Zod
│  ├─ conflicts.ts                   # detecção de conflito (puro, testado)
│  ├─ events-service.ts              # regras de CRUD + disparo do sync
│  ├─ google/
│  │  ├─ client.ts                   # fetch com retry/backoff + refresh do token
│  │  ├─ mapping.ts                  # App ⇄ Google (puro, testado)
│  │  ├─ calendar-sync.ts            # push, pull incremental, watch, 410
│  ├─ time.ts, recurrence.ts
├─ tests/                            # Vitest
├─ custom-worker.ts                  # fetch do OpenNext + scheduled() (Cron Trigger)
├─ open-next.config.ts, wrangler.jsonc, drizzle.config.ts, vitest.config.ts
└─ .dev.vars.example                 # secrets locais
```

## Schema

Fonte única: [`db/schema.ts`](../db/schema.ts). SQL gerado em [`drizzle/`](../drizzle).

| Tabela | Uso | Etapa |
|---|---|---|
| users, sessions, accounts, verifications | Better Auth (e-mail + senha; hash PBKDF2 em `accounts.password`) | 4 |
| google_connections | integração Google por usuário: e-mail/sub da conta, tokens criptografados, `status` (active/revoked/disconnected) | 6 |
| categories | nome + cor | 5/7 |
| events | compromissos + campos de sync (`google_event_id`, `google_etag`, `sync_status`, `sync_attempts`, `next_retry_at`, `sync_error`) | 5/6 |
| reminders | `event_id`/`task_id`, `minutes_before`, `method` (popup/email/push), `sent_at` | 6/8C |
| tasks, subtasks | tarefas P1–P3, status, aguardando/último contato, RRULE, `google_task_id` | 8B |
| inbox_items | captura rápida (digitado/voz) | 8A |
| contacts (+ `contact_id` em events/tasks) | pessoas | 8F |
| recurring_templates | rotinas de gestão | 8D |
| sync_state | por usuário/recurso: `sync_token`, `channel_id`, `resource_id`, `channel_token`, `channel_expiration` | 6 |
| push_subscriptions, notification_log | Web Push e dedupe | 8C |
| audit_log | trilha de conflitos/sync/exclusões | 6 |

Todas as datas são `TEXT` ISO 8601 em UTC. Booleans são `INTEGER` (0/1).
