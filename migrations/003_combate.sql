-- Modo Combate (jogo de acao): o multiplicador sobe a cada pipa cortada,
-- registrado corte a corte pelo servidor. O "ponto em que o vento vira"
-- (ceiling) e sorteado de forma provably fair no inicio e so e revelado
-- quando o round termina.

ALTER TABLE rounds ADD COLUMN ceiling_x100 INTEGER;                   -- secreto ate o fim do round
ALTER TABLE rounds ADD COLUMN mult_x100 INTEGER NOT NULL DEFAULT 100; -- multiplicador atual (1,00x)
ALTER TABLE rounds ADD COLUMN counts JSONB NOT NULL DEFAULT '{}';     -- cortes por tipo de rival
ALTER TABLE rounds ADD COLUMN last_cut_at TIMESTAMPTZ;
-- como terminou: cashed (recolheu), wind (vento virou), cut (cortaram sua pipa), forfeit (desistiu)
ALTER TABLE rounds ADD COLUMN end_reason TEXT CHECK (end_reason IN ('cashed','wind','cut','forfeit'));
