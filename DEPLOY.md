# Deploy: Neon (Postgres) + Render (app)

## 1. Banco no Neon

1. Em neon.tech, crie um projeto **na região AWS us-east-2 (Ohio)**, a mesma do Render no `render.yaml`.
2. Em **Connection Details**, copie a string **com pooling** (host contém `-pooler`).
3. Troque o final para `?sslmode=verify-full`. Exemplo:
   `postgres://usuario:senha@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=verify-full`

As tabelas são criadas sozinhas no primeiro start (migrations automáticas).

## 2. Código no GitHub

O Render faz deploy a partir de um repositório Git. Crie um repositório **privado** e envie
o projeto. O `.gitignore` já exclui `.env`, `data/` e `node_modules/`.

## 3. App no Render

1. **New → Blueprint** e selecione o repositório (o Render lê o `render.yaml`).
2. Preencha as variáveis marcadas como secretas:
   - `DATABASE_URL`: a string do Neon (passo 1).
   - `ADMIN_PHONES`: seu telefone, só dígitos.
   - `SESSION_SECRET` e `PAYMENTS_WEBHOOK_SECRET` são gerados pelo Render.
3. Faça o deploy. Quando o health check (`/healthz`) passar, o app está no ar em
   `https://pipacombate.onrender.com` (ou com o nome escolhido).

## 3b. Alternativa gratuita: Koyeb

1. **Neon:** crie o projeto na região **AWS us-east-1 (N. Virginia)**, perto da região
   gratuita do Koyeb em Washington. Copie a string com pooling e use `?sslmode=verify-full`.
2. Em koyeb.com: **Create Web Service → GitHub →** `Mtz08/PipaCombate`, branch `main`.
3. **Builder:** Buildpack (detecta Node). Build: `npm ci --omit=dev` · Run: `npm start`.
   Também funciona com **Dockerfile** (já incluso).
4. **Instance:** Free · **Region:** Washington, D.C.
5. **Port:** `8000` (HTTP). O Koyeb injeta `PORT=8000` e o app usa automaticamente.
6. **Health check:** HTTP, path `/healthz`.
7. **Environment variables** (marque os segredos como *Secret*):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | string do Neon (secret) |
   | `SESSION_SECRET` | gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` (secret) |
   | `PAYMENTS_PROVIDER` | `mock` |
   | `TRUST_PROXY` | `1` |
   | `ADMIN_PHONES` | seu telefone, só dígitos |
   | `DB_POOL_MAX` | `5` |

8. **Deploy.** A URL fica como `https://<nome>-<conta>.koyeb.app`.

No plano gratuito a instância "dorme" sem uso, e o primeiro acesso depois disso demora alguns segundos.

## 4. Domínio próprio (opcional)

Render → Settings → **Custom Domains**: adicione o domínio e crie no seu DNS o registro
CNAME indicado. O HTTPS é emitido automaticamente.

## Observações

- **Plano:** o `free` do Render "dorme" após inatividade (o primeiro acesso demora ~1 min).
  Para jogo aberto ao público, use no mínimo o `starter`.
- **Uma instância:** o rate limit é em memória. Para escalar para mais de uma, adicione Redis.
- **Backups:** o Neon guarda histórico (point-in-time restore) conforme o plano; confira a retenção.
- **Pagamento continua MOCK** (`PAYMENTS_PROVIDER=mock`) até integrar o PSP.
- **Antes de aceitar dinheiro real:** autorização da SPA/MF (Lei 14.790/2023), KYC e jogo
  responsável. Validar com o jurídico.
