-- Parametros do jogo editaveis e jogo responsavel.

-- Cada rodada guarda o RTP e o teto com que o vento foi sorteado: mudar os
-- parametros no admin nao invalida a verificacao das rodadas antigas.
ALTER TABLE rounds ADD COLUMN rtp_bps INTEGER NOT NULL DEFAULT 9600;
ALTER TABLE rounds ADD COLUMN max_mult_x100 INTEGER NOT NULL DEFAULT 5000;

-- Limite de deposito definido pelo proprio jogador. Reduzir vale na hora;
-- aumentar ou remover so vale 24h depois (dep_limit_next_*).
ALTER TABLE users ADD COLUMN dep_limit_cents BIGINT CHECK (dep_limit_cents > 0);
ALTER TABLE users ADD COLUMN dep_limit_period TEXT CHECK (dep_limit_period IN ('dia','semana','mes'));
ALTER TABLE users ADD COLUMN dep_limit_next_cents BIGINT;
ALTER TABLE users ADD COLUMN dep_limit_next_period TEXT;
ALTER TABLE users ADD COLUMN dep_limit_next_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN dep_limit_next_set BOOLEAN NOT NULL DEFAULT false;

-- Autoexclusao: sem apostar e sem depositar ate a data (saque continua liberado).
ALTER TABLE users ADD COLUMN self_excluded_until TIMESTAMPTZ;
