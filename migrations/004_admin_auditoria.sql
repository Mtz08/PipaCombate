-- Papel do usuario e trilha de auditoria (append-only).

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin'));

-- ajuste manual de saldo pelo admin entra no extrato como 'adjust'
ALTER TABLE ledger DROP CONSTRAINT ledger_type_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_type_check CHECK (type IN ('deposit','withdraw','withdraw_reversal','bet','prize','bonus','adjust'));

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),   -- quem foi afetado (pode ser nulo: login falho)
  actor_id    UUID REFERENCES users(id),   -- quem fez (admin), quando diferente do usuario
  action      TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}', -- nunca senha, CPF ou chave PIX completa
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_user_idx ON audit_log (user_id, id DESC);
CREATE INDEX audit_action_idx ON audit_log (action, id DESC);
CREATE INDEX rounds_open_idx ON rounds (created_at) WHERE state = 'open';
