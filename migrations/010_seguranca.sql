-- Seguranca: bloqueio de login por telefone, 2FA (TOTP) do admin.

-- Tentativas de login por telefone (exista a conta ou nao: mesmo comportamento,
-- para nao revelar quais telefones estao cadastrados).
CREATE TABLE login_throttle (
  phone         TEXT PRIMARY KEY,
  fails         INTEGER NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2FA do admin: segredo TOTP cifrado (AES-256-GCM com DATA_KEY), ultimo passo
-- usado (codigo nao vale duas vezes) e janela de reautenticacao para acoes criticas.
ALTER TABLE users ADD COLUMN totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN totp_last_step BIGINT;
ALTER TABLE users ADD COLUMN admin_reauth_until TIMESTAMPTZ;
