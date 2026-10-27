-- Modo teste (SO desenvolvimento): conta em que o vento nunca vira, para testar
-- o jogo. O servidor ignora a flag em producao (ver game.js). Rodadas de teste
-- ficam marcadas e nao entram em ranking, saques publicos nem comissoes.
ALTER TABLE users ADD COLUMN test_always_win BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rounds ADD COLUMN teste BOOLEAN NOT NULL DEFAULT false;
