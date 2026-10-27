# Pipa Combate: segurança (Fase 8)

Atualizado em 27/10/2026. Revisão feita em três frentes independentes (contas e admin; fluxos de dinheiro; jogo e front-end), seguida das correções abaixo. 67 testes automatizados cobrem as proteções.

## 1. O que foi corrigido

| # | Gravidade | Problema | Correção |
|---|---|---|---|
| 1 | Crítico | Quem cadastrasse o telefone que estava em `ADMIN_PHONES` virava admin | Variável removida. Admin só pela linha de comando no servidor: `npm run admin -- conceder <telefone>` |
| 2 | Crítico | Produção podia subir com pagamento simulado (depósito "pago" sem dinheiro) | Fora de `development`/`test`, o servidor recusa subir com `PAYMENTS_PROVIDER=mock` |
| 3 | Crítico | Ciclo deposita→saca para gerar comissão de indicação | Rollover do depósito antes do saque; comissão de depósito devolvida quando o indicado saca |
| 4 | Alto | Multi-contas para CPA | CPF único por conta; CPA só depois que o indicado aposta o depósito mínimo |
| 5 | Alto | Timeout do PSP estornava um PIX que pode ter saído (pagamento em dobro) | Estorno só com recusa definitiva; erro incerto fica "processing" até o webhook |
| 6 | Médio | Segredos de desenvolvimento valiam com `NODE_ENV` vazio ou "staging" | Seguro por padrão: só `development` e `test` explícitos relaxam as regras |
| 7 | Médio | Rate limit burlável (X-Forwarded-For, IPv6) e sem bloqueio por conta | `TRUST_PROXY` numérico validado, IPv6 agrupado por /64, bloqueio progressivo por telefone (5 erros → 15 min, dobrando até 24h), limites por usuário no jogo e na carteira |
| 8 | Médio | Ações críticas do admin sem 2FA | 2FA (TOTP, app autenticador) obrigatório; código confirmado nos últimos 10 min para aprovar saque, ajustar saldo, desbloquear conta e mudar configurações; sessão de admin de 2h; admin não age na própria conta |
| 9 | Médio | Saques em "processing" sem saída; status sem guarda; recusa não atômica | Webhook `transfer.paid/failed`; toda troca de status condicionada ao status anterior; recusa e estorno na mesma transação |
| 10 | Médio | Sessão roubada sacava sem senha | Saque (normal e de comissão) pede a senha |
| 11 | Médio | Devolução PIX (MED) não tratada | Webhook `charge.refunded`: debita o que houver, estorna as comissões daquele depósito e bloqueia a conta para análise |
| 12 | Médio | CSP com curingas e `style` inline | Hosts exatos dos pixels, `style-src-attr 'none'`, `object-src 'none'`, `Permissions-Policy`, `Referrer-Policy`, HSTS 2 anos |
| 13 | Baixo | Rodada abandonada era sacada a favor do jogador | Encerrada sem prêmio (`timeout`); quem reconecta a tempo ainda saca |
| 14 | Baixo | Seed secreta do sorteio em texto puro no banco | Cifrada (AES-256-GCM com `DATA_KEY`) até ser revelada |
| 15 | Baixo | `toast` aceitava HTML; dados pessoais no navegador; QR de URL arbitrária | Texto puro por padrão; navegador guarda só id e nome; QR só como PNG base64 |
| 16 | Baixo | Intervalo entre cortes com dois relógios | Medido no relógio do banco |
| 17 | Baixo | Senha com acento/emoji truncada pelo bcrypt; chave `__proto__` nas configurações | Limite em bytes; `Object.hasOwn` |
| 18 | — | Robôs/scripts no jogo | Lista "Possíveis robôs" no admin (20+ rodadas sem nunca ser cortado). Pela matemática do teto, nem um robô passa de ~96% de retorno |

## 2. Riscos que continuam (e o que reduz cada um)

| Risco | Situação | Como reduzir |
|---|---|---|
| Telefone não é verificado (sem SMS) | Cadastro aceita qualquer número; o 409 revela telefone cadastrado (limitado por IP) | Verificação por SMS/WhatsApp (OTP) quando houver provedor |
| RevShare com cadeia abandonada | CPF único torna caro, mas não impossível com CPFs de terceiros | Preferir CPA ou % de depósito; acompanhar afiliados com saldo negativo |
| Chave PIX de outro titular | O mock não confere | Exigir do PSP a validação DICT (titular da chave = CPF) na Fase 9 |
| Conciliação de saques | Depende do webhook | Job que consulta o PSP para saques "processing" antigos (Fase 9) |
| Várias instâncias do servidor | Rate limit em memória, por processo | Usar store Redis se escalar para mais de uma instância |
| Script de terceiros (pixels) | Só com consentimento e hosts exatos, mas roda no domínio | Avaliar Conversions API pelo servidor e menos pixels no navegador |

## 3. Checklist de produção (Fase 10)

- `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET` e `DATA_KEY` (32+ caracteres, diferentes entre si, guardados fora do repositório), `PAYMENTS_PROVIDER` real e `PAYMENTS_WEBHOOK_SECRET`.
- `TRUST_PROXY` = número exato de proxies (Cloudflare → Caddy = 2; só Caddy = 1).
- `DATA_KEY` nunca muda depois de definida: ela decifra CPFs de saques em análise, seeds do sorteio e segredos do 2FA. Backup dela em local seguro.
- Criar o admin: cadastro pelo site → `npm run admin -- conceder <telefone>` → ativar o 2FA no 1º acesso ao painel. Perdeu o celular: `npm run admin -- zerar-2fa <telefone>`.
- Cloudflare: proxy ligado, WAF e proteção contra DDoS, "Always Use HTTPS", TLS "Full (strict)".
- Servidor: só portas 80/443 abertas (SSH restrito por chave e IP), atualizações automáticas, backup do banco cifrado e testado.
- `npm audit` sem vulnerabilidades antes de cada deploy.
