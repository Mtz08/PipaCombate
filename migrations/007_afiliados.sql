-- Indique e ganhe: configuracoes editaveis pelo admin e extrato do afiliado.

-- Configuracoes do sistema editaveis pelo painel (chave -> JSON).
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extrato do afiliado: append-only, saldo = soma. Sem coluna de saldo para
-- nao travar a linha do afiliado a cada deposito/rodada dos indicados.
CREATE TABLE affiliate_ledger (
  id            BIGSERIAL PRIMARY KEY,
  affiliate_id  UUID NOT NULL REFERENCES users(id),
  referral_id   UUID REFERENCES users(id),    -- quem gerou a comissao
  level         SMALLINT,                      -- 1 = indicado direto
  type          TEXT NOT NULL CHECK (type IN ('cpa','deposit','revshare','withdraw','withdraw_reversal','adjust')),
  delta_cents   BIGINT NOT NULL CHECK (delta_cents <> 0),
  meta          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_ledger_aff_idx ON affiliate_ledger (affiliate_id, id DESC);
-- CPA paga uma unica vez por indicado e nivel.
CREATE UNIQUE INDEX affiliate_cpa_once ON affiliate_ledger (affiliate_id, referral_id) WHERE type = 'cpa';

-- Saque pode sair do saldo de jogo ou do saldo de comissao.
ALTER TABLE withdrawals ADD COLUMN source TEXT NOT NULL DEFAULT 'balance' CHECK (source IN ('balance','affiliate'));
