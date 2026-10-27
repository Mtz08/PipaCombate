-- Antifraude nos fluxos de dinheiro.

-- Rollover: quanto o jogador ainda precisa apostar antes de sacar o que depositou
-- (cada deposito soma, cada aposta desconta). Barra deposito->saque para lavar
-- dinheiro ou gerar comissao de indicacao.
ALTER TABLE users ADD COLUMN wager_required_cents BIGINT NOT NULL DEFAULT 0 CHECK (wager_required_cents >= 0);

-- Um CPF por conta (multi-conta para CPA/comissao). Em bases antigas com CPF
-- repetido, so a conta mais antiga mantem o vinculo; as outras voltam a pedir CPF.
UPDATE users u SET cpf_hash = NULL
 WHERE cpf_hash IS NOT NULL
   AND EXISTS (SELECT 1 FROM users o WHERE o.cpf_hash = u.cpf_hash AND (o.created_at, o.id) < (u.created_at, u.id));
CREATE UNIQUE INDEX users_cpf_hash_uniq ON users (cpf_hash) WHERE cpf_hash IS NOT NULL;

-- Conta bloqueada (ex.: devolucao PIX/MED): sem apostar, depositar ou sacar ate o admin liberar.
ALTER TABLE users ADD COLUMN blocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN blocked_reason TEXT;

-- Rodada abandonada encerra sem premio ('timeout').
ALTER TABLE rounds DROP CONSTRAINT rounds_end_reason_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_end_reason_check CHECK (end_reason IN ('cashed','wind','cut','forfeit','timeout'));

-- Devolucao do deposito (MED/chargeback).
ALTER TABLE charges DROP CONSTRAINT charges_status_check;
ALTER TABLE charges ADD CONSTRAINT charges_status_check CHECK (status IN ('pending','paid','review','refunded'));
ALTER TABLE ledger DROP CONSTRAINT ledger_type_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_type_check
  CHECK (type IN ('deposit','withdraw','withdraw_reversal','bet','prize','bonus','adjust','chargeback'));
ALTER TABLE affiliate_ledger DROP CONSTRAINT affiliate_ledger_type_check;
ALTER TABLE affiliate_ledger ADD CONSTRAINT affiliate_ledger_type_check
  CHECK (type IN ('cpa','deposit','revshare','withdraw','withdraw_reversal','adjust','chargeback'));
