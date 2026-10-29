-- O painel tinha ficado no RTP de 25%. Grava a regra atual: jogo normal
-- em 35% e o bloco das rodadas faceis (3 da conta, 2 por dia, RTP 90%).
UPDATE settings
SET value = value || jsonb_build_object(
      'rtpBps', 3500,
      'inicio', jsonb_build_object(
        'rodadas', 3,
        'rodadasDia', 2,
        'rtpBps', 9000,
        'forca', 1,
        'pctX100', jsonb_build_object(
          'moleque', 10,
          'veloz', 15,
          'aparador', 15,
          'pesadao', 25,
          'cortador', 20,
          'chefe', 100,
          'aparar', 5
        )
      )
    ),
    updated_at = now()
WHERE key = 'jogo';
