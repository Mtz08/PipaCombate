-- Schema inicial. Dinheiro sempre em CENTAVOS (BIGINT), nunca NUMERIC/float.
-- IDs em UUID: nao enumeraveis (ninguem chuta o round/deposito de outro).

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  ref              TEXT,
  referral_code    TEXT NOT NULL UNIQUE,
  balance_cents    BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  session_version  INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extrato: append-only. Nunca UPDATE/DELETE. Soma de delta_cents = saldo.
CREATE TABLE ledger (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id),
  type           TEXT NOT NULL CHECK (type IN ('deposit','withdraw','withdraw_reversal','bet','prize','bonus')),
  delta_cents    BIGINT NOT NULL CHECK (delta_cents <> 0),
  balance_after  BIGINT NOT NULL CHECK (balance_after >= 0),
  meta           JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user_idx ON ledger (user_id, id DESC);

CREATE TABLE rounds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  bet_cents    BIGINT NOT NULL CHECK (bet_cents > 0),
  map          TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','cashed','lost')),
  cuts         INTEGER NOT NULL DEFAULT 0 CHECK (cuts >= 0),
  prize_cents  BIGINT NOT NULL DEFAULT 0 CHECK (prize_cents >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ
);
-- No maximo UM round aberto por usuario, garantido pelo banco.
CREATE UNIQUE INDEX rounds_one_open_per_user ON rounds (user_id) WHERE state = 'open';
CREATE INDEX rounds_user_idx ON rounds (user_id, created_at DESC);

-- Cobrancas de deposito (PIX). Credito so quando status vira 'paid' (webhook).
CREATE TABLE charges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','review')),
  provider      TEXT NOT NULL,
  provider_ref  TEXT UNIQUE,
  copy_paste    TEXT,
  qr_code       TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX charges_user_idx ON charges (user_id, created_at DESC);

-- Pedidos de saque. pix_key completa so enquanto em andamento (LGPD); CPF nunca.
CREATE TABLE withdrawals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  amount_cents  BIGINT NOT NULL CHECK (amount_cents > 0),
  status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','paid','failed')),
  pix_key       TEXT,
  pix_key_mask  TEXT NOT NULL,
  provider      TEXT NOT NULL,
  provider_ref  TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX withdrawals_user_idx ON withdrawals (user_id, created_at DESC);
