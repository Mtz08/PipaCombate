-- Token que a SigiloPay devolve ao criar a cobranca/saque. O webhook
-- repete esse token no corpo; sem ele a notificacao e recusada.
ALTER TABLE charges ADD COLUMN webhook_token TEXT;
ALTER TABLE withdrawals ADD COLUMN webhook_token TEXT;
-- IP de quem pediu o saque. A SigiloPay exige o IPv4 do jogador, nao o do servidor.
ALTER TABLE withdrawals ADD COLUMN client_ip TEXT;
