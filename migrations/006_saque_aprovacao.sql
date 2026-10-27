-- Saque com aprovacao no admin e CPF do titular vinculado a conta.

-- 'review': aguardando aprovacao (saldo ja debitado); 'rejected': recusado pelo admin (estornado).
ALTER TABLE withdrawals DROP CONSTRAINT withdrawals_status_check;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_status_check
  CHECK (status IN ('review','processing','paid','failed','rejected'));

-- CPF cifrado (AES-256-GCM) so enquanto o saque espera aprovacao; apagado ao finalizar.
ALTER TABLE withdrawals ADD COLUMN cpf_enc TEXT;
ALTER TABLE withdrawals ADD COLUMN reviewed_by UUID REFERENCES users(id);
ALTER TABLE withdrawals ADD COLUMN reviewed_at TIMESTAMPTZ;
ALTER TABLE withdrawals ADD COLUMN review_note TEXT;
CREATE INDEX withdrawals_review_idx ON withdrawals (created_at) WHERE status = 'review';

-- Hash (HMAC) do CPF do primeiro saque: os proximos precisam ser do mesmo titular.
ALTER TABLE users ADD COLUMN cpf_hash TEXT;
