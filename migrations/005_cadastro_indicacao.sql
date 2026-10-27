-- Cadastro: quem indicou (afiliado) e registro do aceite dos termos.

-- `ref` guarda o codigo digitado; `referred_by` so e preenchido quando o codigo existe.
ALTER TABLE users ADD COLUMN referred_by UUID REFERENCES users(id);
CREATE INDEX users_referred_by_idx ON users (referred_by) WHERE referred_by IS NOT NULL;

-- Aceite de "maior de 18 + termos": quando e qual versao do texto.
ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN terms_version TEXT;
