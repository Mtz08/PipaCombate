-- As 3 primeiras rodadas da conta usam RTP, forca e percentuais mais
-- folgados (ver CONFIG.game.inicio). A flag fica na rodada para o corte
-- pagar a tabela com que ela foi aberta, mesmo depois da quarta.
ALTER TABLE rounds ADD COLUMN iniciante BOOLEAN NOT NULL DEFAULT false;
