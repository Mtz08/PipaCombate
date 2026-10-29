-- Casa ganha cerca de 65% das rodadas: RTP 35%. Forca e percentuais
-- de corte continuam os da migration 014.
UPDATE settings
SET value = jsonb_set(value, '{rtpBps}', '3500'),
    updated_at = now()
WHERE key = 'jogo';
