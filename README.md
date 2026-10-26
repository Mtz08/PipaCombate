# Pipa Combate

Backend (Node.js + Express) e frontend (vanilla JS) do Pipa Combate, estruturados
para ir ao ar. A camada de pagamento é **plugável**: hoje roda com o provider
`mock` (nenhum PIX, nenhum dinheiro real). Integrar o PSP é implementar um
arquivo em `server/payments/`, sem tocar no domínio nem nas rotas.

## Rodar

```bash
npm install
cp .env.example .env     # opcional em dev; obrigatório preencher em produção
npm start                # http://localhost:3000
npm test                 # 41 testes: banco, domínio, pagamento e API ponta a ponta
```

Requer Node.js 20.12+ (usa `process.loadEnvFile`).

### Banco de dados

| Ambiente | Banco | Como |
|---|---|---|
| Dev local | **PGlite** (Postgres 17 em WASM, dentro do Node) | automático sem `DATABASE_URL`; dados em `./data/pglite` |
| Testes | PGlite em memória, zerado por arquivo | automático no `npm test` |
| Produção / Docker | **Postgres real** | `DATABASE_URL=postgres://...` (obrigatório em produção) |

O mesmo SQL e as mesmas migrations (`migrations/*.sql`) valem para os dois. As
migrations rodam ao subir (`DB_AUTO_MIGRATE=true`) ou via `npm run migrate`. Para
zerar o banco de dev, apague a pasta `data/`.

### Docker (Postgres + app)

```bash
# no .env: SESSION_SECRET e POSTGRES_PASSWORD
docker compose up -d --build     # http://localhost:3000
```

O Postgres não fica exposto fora da rede do compose; os dados ficam no volume `pgdata`.

Em produção (`NODE_ENV=production`) o servidor **se recusa a subir** sem
`SESSION_SECRET` forte (mínimo de 32 caracteres) e, com PSP real, sem `PAYMENTS_WEBHOOK_SECRET`.

## Estrutura

```
server/
  index.js          abre a porta + desligamento gracioso (SIGTERM)
  app.js            monta o Express (helmet, rate limit, CSRF, rotas)
  config.js         ambiente, banco, limites, parâmetros do jogo
  db/index.js       conexão (pg ou PGlite), transações, migrations, withUserLock
  db/repos.js       SQL de cada tabela (users, ledger, rounds, charges, withdrawals)
  domain/           accounts, wallet, game, payments (regra de negócio)
  payments/         contrato do PSP + provider mock
  middleware/       session, csrf, rateLimit, error
  routes/           auth, game, wallet, public, webhooks
  util/             money, validate
public/             frontend (HTML + ES modules + CSS)
migrations/         schema versionado (SQL puro)
scripts/            migrate + setup dos testes
Dockerfile, docker-compose.yml
```

Camadas: **routes → domain → db**. Toda operação de saldo roda em
`withUserLock`: uma transação que trava a linha do usuário (`SELECT … FOR
UPDATE`). Isso serializa as operações do mesmo jogador entre processos e
instâncias, e qualquer erro desfaz tudo (ROLLBACK).

Garantias que vêm do próprio banco (última barreira, mesmo se o código errar):
- `CHECK (balance_cents >= 0)`: saldo nunca fica negativo.
- Índice único parcial: no máximo **um round aberto** por usuário.
- `UNIQUE` em telefone e em `provider_ref` (cobrança/saque do PSP).
- Extrato (`ledger`) só recebe INSERT. A soma de `delta_cents` bate com o saldo.
- IDs em UUID: não dá para chutar o round ou o depósito de outra pessoa.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/healthz` | health check (load balancer) |
| GET | `/api/public/config` | config pública |
| POST | `/api/auth/register` | `{ name, phone, password, ref }` |
| POST | `/api/auth/login` | `{ phone, password }` |
| GET | `/api/auth/me` | sessão atual |
| POST | `/api/auth/logout` | encerra e **revoga** todas as sessões |
| GET | `/api/game/lobby` | parâmetros, RTP e tabela de multiplicadores |
| GET | `/api/game/active` | round em andamento (retomar) |
| POST | `/api/game/start` | `{ betCents, map }` — debita a aposta |
| POST | `/api/game/:round/cut` | corte (RNG no servidor) |
| POST | `/api/game/:round/cashout` | credita o prêmio |
| POST | `/api/game/:round/lose` | desistência |
| GET | `/api/game/history` | rounds encerrados + dados de verificação |
| GET | `/api/fair` | hash da seed ativa, client seed, nonce, seed anterior revelada |
| POST | `/api/fair/client-seed` | `{ clientSeed }`: troca a seed (revela a do servidor) |
| POST | `/api/fair/rotate` | revela a seed do servidor e gera nova |
| GET | `/api/fair/verify` | `?serverSeed&clientSeed&nonce`: verificador público |
| GET | `/api/wallet` | saldo + extrato |
| POST | `/api/wallet/deposit` | `{ amountCents }` — cria cobrança PIX |
| GET | `/api/wallet/deposit/:id` | status da cobrança |
| POST | `/api/wallet/withdraw` | `{ amountCents, pixKey, cpf }` |
| POST | `/api/webhooks/payments` | webhook do PSP (assinatura HMAC) |

## Jogo: Combate (modelo "vento vira")

Jogo de ação em canvas: o jogador pilota a pipa, corta a linha dos rivais
cruzando-as, apara pipas que caem e enfrenta um chefão a cada 5 ondas.
Cada corte é registrado **pelo servidor** e soma ao multiplicador
(moleque +0,10x … chefão +1,00x; tabela em `config.js > game.pctX100`).

Antes da rodada, o servidor sorteia (provably fair) o ponto em que **o vento
vira**: `vento = floor(100·RTP/(1−u))/100`, limitado a 50x. Se o multiplicador
alcança esse ponto, a rodada acaba sem prêmio. Quem recolher antes leva
aposta × multiplicador. Como P(vento > m) ≤ RTP/m, **qualquer estratégia tem
retorno esperado ≤ 96%**, inclusive contra cliente adulterado (inventar cortes
só antecipa o vento). Os rivais têm a mesma força em todas as rodadas. O
servidor recusa cortes com intervalo < 250 ms.

## Provably fair (jogo verificável)

Nenhum resultado é sorteado na hora: cada corte é **derivado** de seeds
comprometidas antes da jogada.

1. O servidor gera uma `server_seed` secreta e mostra só `sha256(server_seed)`.
2. O jogador tem a sua `client_seed` (aleatória por padrão, pode trocar).
3. Cada round usa um `nonce` (0, 1, 2…). Sorteio do corte *n*:
   `HMAC_SHA256(server_seed, "client_seed:nonce:n:r")` → 4 primeiros bytes
   (uint32) → rejeição para ficar uniforme em 0..9999. Perde se `< 2500` (25%).
4. Ao trocar a seed, a `server_seed` antiga é revelada. O jogador confere que o
   hash bate com o publicado e recalcula cada round **no próprio navegador**
   (WebCrypto, `public/js/game/fair.js`), sem depender do servidor.

Não é permitido trocar a seed com round aberto. Desistências ficam marcadas
(`forfeit`) para a verificação continuar estrita. Os testes conferem que os
rounds jogados batem com o verificador e que a distribuição é de ~25%.

## Frontend do jogo

Canvas 2D em `public/js/game/`, com toda a arte **gerada em código** (sem
imagens nem assets de terceiros):

| Arquivo | Papel |
|---|---|
| `catalog.js` | mapas (Laje, Praia, Campo) e skins de pipa. **Só visual**, sem efeito na chance nem no prêmio |
| `art.js` | desenho de céu, cenários, pipas com rabiola e linhas |
| `scene.js` | loop de animação e encenações: subir a pipa, adversário chegando, corte, queda, comemoração |
| `audio.js` | efeitos sintetizados com Web Audio, com botão de mudo |

A cena **só encena** o resultado que o servidor devolveu: a animação do
adversário chegando roda em paralelo com a chamada à API, e o desfecho (cortou
ou foi cortado) vem da resposta. Respeita `prefers-reduced-motion`, ajusta-se à
tela (incluindo telas de alta densidade) e lembra mapa, skin e mudo no navegador.

## Pagamentos

- **Depósito:** cria a cobrança (`pending`), o PSP gera o PIX e o saldo só sobe
  quando o **webhook** confirma. A confirmação é idempotente: evento repetido não
  credita duas vezes, e valor divergente vai para `review`. No mock, a confirmação
  é imediata (`PAYMENTS_MOCK_AUTOCONFIRM=false` desliga).
- **Saque:** o débito e o registro do pedido acontecem na mesma operação atômica;
  se o PSP recusar, há estorno automático (`withdraw_reversal`).
- **Para integrar o PSP:** crie `server/payments/<psp>.js` com `createPixCharge`,
  `sendPixTransfer` e `parseWebhook` (contrato em `payments/index.js`), registre-o
  e defina `PAYMENTS_PROVIDER`.

## Segurança

- Senha com bcrypt (custo 12), com 8 a 72 caracteres. O login tem tempo e
  mensagem iguais para telefone inexistente e senha errada (não revela cadastro).
- Sessão em cookie httpOnly assinado (HMAC), com prefixo `__Host-` e `Secure`
  em produção. O logout revoga todas as cópias do cookie (`sessionVersion`).
- CSRF por `X-Requested-With` + `SameSite=Lax`. Os webhooks ficam fora do CSRF e
  são autenticados por assinatura.
- `helmet`: CSP restrita, HSTS (produção), `nosniff`, `frame-ancestors 'none'`.
- Rate limit: 10 tentativas de login/cadastro a cada 15 min por IP e 300 req/min na API.
  Atrás de proxy, defina `TRUST_PROXY`.
- Frontend escapa todo dado vindo da API antes de montar HTML (XSS).
- **LGPD:** o CPF é validado pelos dígitos verificadores e repassado ao PSP, mas
  **nunca persistido**. A chave PIX completa só fica guardada enquanto o saque está
  em andamento; no extrato aparece mascarada. Nenhum dado sensível vai para o log.

## Operação (admin, auditoria, logs)

- **Admin:** telefones em `ADMIN_PHONES` viram admin ao entrar. O painel fica em `/admin.html`,
  com números (depósitos, saques, apostado, prêmios, GGR, RTP real), busca de jogadores
  (telefone mascarado), extrato/rounds/auditoria por jogador e **ajuste de saldo com motivo
  obrigatório** (entra no extrato como `adjust` e na auditoria). Para quem não é admin, as
  rotas `/api/admin/*` respondem 404.
- **Auditoria** (`audit_log`, só inclusão): cadastro, login, login com falha, logout,
  depósito, saque, saque com falha, troca de seed, ajuste do admin e round expirado.
  Nunca grava senha, CPF ou chave PIX completa.
- **Logs:** uma linha JSON por requisição (`rid`, método, rota, status, ms, usuário),
  com `X-Request-Id`. Nunca grava corpo de requisição.
- **Rounds abandonados:** a cada minuto, rounds abertos há mais de `ROUND_TTL_MIN`
  (padrão 30) são encerrados. Com corte, recolhe a favor do jogador; sem corte, desistência.

## Limitações atuais (próximas fases)

1. Rate limit vale **por processo**. Com mais de uma instância, use um store
   compartilhado (Redis). As travas de saldo já são do banco.
2. Backup do Postgres não está configurado (fazer no provedor ou com `pg_dump` agendado).
3. Rounds abertos não expiram sozinhos (o jogador retoma ou desiste).
4. Não há verificação de idade/identidade (KYC) nem limites de jogo responsável.
   Ambos são **exigidos** pela regulamentação para operar com dinheiro real.

## Regulatório

Apostas de quota fixa no Brasil exigem autorização da Secretaria de Prêmios e
Apostas do Ministério da Fazenda (Lei 14.790/2023 e portarias da SPA/MF). Validar
com o jurídico antes de operar com dinheiro real.
