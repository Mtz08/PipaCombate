-- CPA: 10% do primeiro deposito que atinge R$ 25, so no nivel direto.
-- Quem ja salvou o programa no painel passa a essa regra. Saque minimo fica.
UPDATE settings
SET value = value || jsonb_build_object(
      'modelo', 'cpa',
      'niveisPct', jsonb_build_array(10, 0, 0),
      'cpaDepositoMinCents', 2500
    ),
    updated_at = now()
WHERE key = 'afiliados';
