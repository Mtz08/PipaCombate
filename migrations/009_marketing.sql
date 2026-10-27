-- Marketing: origem do cadastro (UTMs da primeira visita) para atribuir campanhas.
ALTER TABLE users ADD COLUMN utm JSONB;
CREATE INDEX users_utm_source_idx ON users ((utm->>'utm_source')) WHERE utm IS NOT NULL;
