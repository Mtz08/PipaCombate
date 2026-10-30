-- CPA por faixa: 10% no inicio, 15% com 5 amigos que depositaram o minimo, 20% com 10.
UPDATE settings
SET value = value || jsonb_build_object(
      'modelo', 'cpa',
      'niveisPct', jsonb_build_array(10, 15, 20),
      'cpaMetas', jsonb_build_array(0, 5, 10),
      'cpaDepositoMinCents', 2500
    ),
    updated_at = now()
WHERE key = 'afiliados';
