-- Casa ganha cerca de 75% das rodadas: RTP 25%, rivais mais fortes e
-- percentuais de corte menores. So altera o painel se a chave 'jogo' ja
-- foi salva; instalacao nova usa o padrao de server/config.js.
UPDATE settings
SET value = value || jsonb_build_object(
      'rtpBps', 2500,
      'forca', 2.4,
      'pctX100', jsonb_build_object(
        'moleque', 5,
        'veloz', 8,
        'aparador', 8,
        'pesadao', 12,
        'cortador', 10,
        'chefe', 50,
        'aparar', 3
      )
    ),
    updated_at = now()
WHERE key = 'jogo';
