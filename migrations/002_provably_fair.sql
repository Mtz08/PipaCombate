-- Provably fair: par de seeds por usuario. O hash da seed do servidor e
-- publicado ANTES das jogadas; a seed so e revelada ao ser trocada (rotate).

CREATE TABLE fair_seeds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  server_seed       TEXT NOT NULL,          -- secreta ate revealed_at
  server_seed_hash  TEXT NOT NULL,          -- sha256(server_seed), publico desde o inicio
  client_seed       TEXT NOT NULL,
  nonce             INTEGER NOT NULL DEFAULT 0 CHECK (nonce >= 0), -- proximo nonce a usar
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revealed_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX fair_seeds_one_active ON fair_seeds (user_id) WHERE active;
CREATE INDEX fair_seeds_user_idx ON fair_seeds (user_id, created_at DESC);

-- Cada round aponta para o par de seeds e o nonce que decidiram seus cortes.
ALTER TABLE rounds ADD COLUMN seed_id UUID REFERENCES fair_seeds(id);
ALTER TABLE rounds ADD COLUMN nonce INTEGER;
-- desistencia (lose sem ser cortado): distingue de 'cortada' na verificacao
ALTER TABLE rounds ADD COLUMN forfeit BOOLEAN NOT NULL DEFAULT false;
