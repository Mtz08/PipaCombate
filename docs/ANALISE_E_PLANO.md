# Pipa Combate: análise do site antigo e plano de reconstrução

Data da análise: 27/10/2026
Fonte: `https://pipacombate.online/cadastro?ref=MZGZTEFF`, capturado com o navegador e a ferramenta REA (evidência `ev_ea5d7125…`)
Cópia do front-end recuperado: `referencia/site-original/` (está no `.gitignore` e não vai para o repositório)

---

## 1. O que foi recuperado

O front-end antigo **não é minificado nem empacotado**. São módulos ES puros, com comentários. Na prática, o código-fonte do cliente voltou inteiro.

| Arquivo | Linhas | Conteúdo |
|---|---|---|
| `cadastro.html` | 337 | SPA única com todas as telas: splash, auth, lobby, HUD, sheets, pausa, resultado e modal |
| `js/main.js` | 1979 | Motor do jogo (física das linhas, bots, ondas, chefão, power-ups), render em canvas, HUD e todas as telas |
| `js/figure.js` | 1101 | Desenho do "bonequinho" (personagem customizável) |
| `js/art.js` | 541 | Arte procedural das pipas e do cenário |
| `js/audio.js` | 323 | Áudio (música, efeitos, narração, torcida, chuva) |
| `js/data.js` | 122 | Conteúdo: 10 pipas, 5 tipos de rival, chefões, mapas, power-ups, opções do personagem |
| `js/store.js` | 39 | Preferências locais (`localStorage: pipacombate_prefs_v3`) |
| `js/api.js` | 86 | Cliente da API |
| `js/pixels.js` | 72 | Pixels Meta, TikTok, Kwai e UTMify |
| `css/style.css` | 445 | Visual completo |

Não foi possível recuperar:
- **O backend.** O comentário em `api.js` diz que ele é a plataforma **"BlockWin"** (servidor genérico de cassino: carteira, PIX, afiliados, admin). Pelo navegador só se vê o contrato da API, não o código.
- O mp3 da trilha (`/audio/pipa-combate-brenin.mp3`) e as imagens em `/block/images/`. Dá para baixar à parte, se você quiser.

## 2. Arquitetura observada

| Camada | Observado |
|---|---|
| Hospedagem | Cloudflare na frente (beacon `cloudflareinsights` e `/cdn-cgi/rum`) |
| Front-end | HTML único, JS em módulos ES e cache-busting por `?v=d21` |
| Fontes | Google Fonts: Lilita One, Nunito e Press Start 2P (para o estilo "pixel") |
| Sessão | Cookie httpOnly. O JS guarda só o usuário em `localStorage: pipacombate_user` |
| CSRF | Header `X-Requested-With: XMLHttpRequest` |
| Dinheiro | Inteiros em **centavos** |
| PWA | `manifest.webmanifest` com `display: fullscreen` |
| Marketing | Pixels Meta, TikTok e Kwai e UTMify, ligados por `api/public/config` |

### 2.1 Contrato da API antiga (`/api/*`)

| Método | Rota | Corpo / retorno |
|---|---|---|
| GET | `public/config` | Nome, logo, valores rápidos de depósito, valores de entrada, limites financeiros, popup e IDs de pixel |
| POST | `auth/register` | `{name, phone, password, ref}` → `{user, balanceCents}` |
| POST | `auth/login` | `{phone, password}` |
| GET | `auth/me`, POST `auth/logout` | Sessão |
| GET | `game/lobby` | `{balance, cfg, history, top, canRefill, user}` |
| GET | `game/active` | Rodada em aberto |
| POST | `game/start` | `{betCents, map}` → `{round, stake, balance, cfg, ceilingMult}` |
| POST | `game/:round/cashout` | `{counts}` → `{win, pct, balance}` |
| POST | `game/:round/lose` | `{counts}` |
| POST | `game/refill` | Recarga de saldo (provavelmente para contas demo) |
| GET | `wallet`, `wallet/deposit-info`, `wallet/withdraw-info` | Extrato e limites |
| POST | `wallet/deposit` | `{amountCents}` → QR Code e copia-e-cola PIX. O front consulta `wallet` a cada X s até confirmar |
| POST | `wallet/withdraw` | `{amountCents, pixKey, cpf}` |
| GET | `indicacao/info` | Link, código, quantidade de indicados, total e saldo de afiliado |
| POST | `wallet/withdraw-affiliate` | `{amountCents, pixKey, cpf}` |

Configuração pública capturada em produção (`api/public/config`):

- Depósito: mínimo R$ 25, máximo R$ 10.000. Valores rápidos: 20, 30, 40, 50, 100 e 200, sendo que 100 e 200 aparecem rotulados como "BÔNUS".
- Saque: mínimo R$ 100, máximo R$ 5.000, sem taxa. Saque de afiliado: mínimo R$ 30.
- Entradas (apostas): 5, 10, 20, 30, 50 e 100.

### 2.2 Telas e funções

- **Cadastro e login.** Nome, telefone (WhatsApp), senha + confirmação, código de indicação (vem preenchido pelo `?ref=`) e aceite de "maior de 18 + termos". O login é por telefone + senha.
- **Lobby.** Saldo, avatar, cenários (mapas), escolha da pipa, tabela "quanto paga cada rival" (+% por tipo), teto de ganho por rodada, histórico, ranking (top), seletor de aposta (−/+), APOSTAR, TREINAR (modo grátis) e recarga.
- **Jogo.** Ondas de rivais (moleque, veloz, aparador, pesadão, cortador, chefão), "aparar" pipas que caem, power-ups, *dash* ("relada"), sequências (streak), câmera lenta e confete. O HUD mostra onda, cortes, vida, aposta, % e ganho, além do botão **SACAR**.
- **Carteira.** Abas Depósito (chips, QR e copia-e-cola), Saque (valor, chave PIX e CPF) e Extrato.
- **Indique e ganhe.** Link, código, compartilhar, totais e saque do afiliado.
- **Personagem.** Pele, cabelo, roupa, sorteio e dança.
- **Configurações.** Música, efeitos, narração, vibração, controle (arrastar, joystick ou dedo), sensibilidade, estilo (cartoon ou pixel), efeitos visuais e tela cheia.
- **Pausa, resultado e "como jogar".**

## 3. Problemas graves no design antigo (não serão reproduzidos)

### 3.1 O resultado da rodada era decidido antes e disfarçado de habilidade

Trecho do `main.js` antigo (`beginRun`):

```js
// Rodada perdedora (teto 0: RTP/modo perda) manda os rivais mais fortes e
// batendo mais — a pipa do jogador é cortada e a rodada termina em derrota,
// coerente com o servidor pagar 0.
else if ((bet.ceilingMult || 0) <= 0) run.forca = +cf.forca_perda || 2.4;
```

Como funcionava:
1. No `game/start`, o servidor já decidia se a rodada seria perdedora (`ceilingMult = 0`).
2. Nessas rodadas, o cliente aumentava em silêncio a força dos rivais (2,4× contra 1,4×) para forçar a derrota.
3. Se o jogador ainda assim conseguisse sacar, o servidor pagava 0.

Para o jogador, parece jogo de habilidade, mas o resultado é predefinido. O manifesto ainda diz "Moedas fictícias", enquanto `api.js` diz "O saldo é REAL" (depósito PIX). Isso configura publicidade enganosa (CDC, Lei 8.078/1990, art. 37) e contraria a exigência de resultado aleatório e auditável para jogos on-line da Lei 14.790/2023. **Não vou implementar esse mecanismo.**

### 3.2 O cliente informava o próprio resultado

O `cashout` e o `lose` mandavam `counts` (quantos rivais de cada tipo o jogador cortou) e o servidor pagava em cima disso. Qualquer pessoa com o DevTools aberto inventa cortes.

### 3.3 "BÔNUS" nos botões de depósito

O site oferecia bônus vinculado a depósito. A regulamentação federal de apostas restringe esse tipo de bonificação. O texto exato precisa ser confirmado (ver seção 6).

### 3.4 Como o repositório atual já resolve

`server/domain/game.js` usa o modelo **"vento vira"** com *provably fair*:
- O servidor sorteia em segredo o ponto em que o vento vira, com seed comprometida por hash.
- Cada corte é registrado no servidor, um a um.
- Os rivais têm a **mesma força em toda rodada**.
- Um cliente adulterado que invente cortes só faz o vento virar mais cedo.

Esse é o modelo que o plano segue.

## 4. Comparação entre o site antigo e o repositório atual

| Funcionalidade | Site antigo | Repositório atual |
|---|---|---|
| Cadastro e login | Telefone + senha + ref | Existe (telefone). Falta conferir nome, aceite 18+ e ref |
| Motor do jogo | Completo (1979 + 1101 + 541 linhas) | Versão menor (`public/js/combat/*`) |
| Personagem customizável | Sim (`figure.js`) | Não |
| Estilos cartoon e pixel, 3 controles | Sim | A conferir |
| Áudio (música, narração, torcida) | Completo | Básico (`game/audio.js`) |
| Mapas e pipas | 10 pipas, vários mapas | Existe (`CONFIG.game.maps`) |
| Resultado justo e auditável | **Não** (rodada pré-definida) | **Sim** (provably fair) |
| Carteira, extrato e saque | Sim | Existe (domínio `wallet`) |
| Pagamento PIX | Gateway do BlockWin | Mock (`server/payments/mock.js`) |
| Indique e ganhe | Sim | A conferir |
| Admin e auditoria | No BlockWin | Existe (`admin`, `audit`) |
| Configuração pública e pixels | Sim | Não |
| PWA | Sim | A conferir |
| Deploy | Cloudflare | Docker, Render, Koyeb, Oracle e Northflank documentados |

## 5. Plano por fases

Cada fase termina com testes passando (`npm test`) e um deploy de homologação.

### Fase 0: Decisões e base ✅ concluída em 27/10/2026
Feito: `npm install`, 41/41 testes passando, migrações 001–004 aplicadas no PGlite local, servidor sobe em `http://localhost:3000`, `server/db.js` removido e `.env` local criado a partir do `.env.example`.

- Responder às perguntas da seção 7.
- `npm install`, rodar os testes e as migrações. Apagar o `server/db.js` que sobrou.
- Definir a identidade visual: reaproveitar fontes, cores e o CSS antigo como ponto de partida, ou partir para um visual novo.

### Fase 1: Contas e sessão ✅ concluída em 27/10/2026
Feito: migração `005_cadastro_indicacao.sql` (`referred_by`, `terms_accepted_at`, `terms_version`); aceite obrigatório no servidor (`TERMS_REQUIRED`); código `?ref=` vinculado ao afiliado (sem diferenciar maiúsculas; código inválido não barra o cadastro) e guardado 30 dias no navegador; confirmação de senha; páginas `termos.html` e `privacidade.html` com texto **provisório**; 43/43 testes e fluxo testado no navegador.
Pendências: o jurídico precisa aprovar o texto dos termos (e atualizar `TERMS_VERSION`); o visual será trocado pelo do site antigo na Fase 2.

- Cadastro: nome, telefone, senha + confirmação, aceite 18+ e termos, `?ref=` preenchendo o código.
- Login por telefone, logout, `auth/me`, rate limit e bloqueio por tentativas.
- Termos de uso e política de privacidade (LGPD, Lei 13.709/2018).

### Fase 2: Motor do jogo (a maior fase) 🟡 base portada em 27/10/2026
Decisão: **teto declarado**. O servidor sorteia (provably fair) o ponto em que o vento vira, RTP 96%; cada tipo de rival soma seu % ao multiplicador; a regra aparece no "Como jogar"; rivais com força fixa (`CONFIG.game.forca = 1.4`), igual em toda rodada e no treino.
Feito: front antigo (HTML, CSS, motor, arte, personagem, áudio e mp3s) em `public/`; `api.js` traduz as respostas do servidor para o formato antigo; cada corte vai ao servidor em fila (`serverCut`, intervalo ≥ 300 ms); evento "O VENTO VIROU!" com tela de resultado própria; saque espera a fila de cortes; IDs de mapa do servidor = os do jogo antigo; CSP liberando só atributos `style`. O painel admin passou a usar `css/painel.css`. Removida a lógica `forca_perda`/`ceilingMult`.
Falta: teste de jogo por pessoas (vento virando, saque, cap), ajustes visuais (cores/logo), simulação de RTP real, ranking (`top`) e histórico verificável (Fase 3), indicação completa (Fase 5).

Portar o motor antigo para `public/js/combat/`, modularizado, **sem** a parte de `forca_perda`:
- Física da linha e da pipa, cruzada/corte, bots com IA, ondas e chefões com habilidades.
- Power-ups, dash, aparar pipa, streaks, câmera lenta e confete.
- Três modos de controle, sensibilidade e estilos cartoon/pixel.
- Personagem (`figure.js`) e arte procedural (`art.js`).
- Áudio completo (`audio.js`).
- Modo **treino** totalmente offline.
- Integração com o servidor: cada corte é enviado e validado pelo servidor ("vento vira"). O cliente nunca define o pagamento.

### Fase 3: Lobby e meta-jogo ✅ concluída em 27/10/2026
Feito: ranking "Maiores ganhos" (7 dias, só saques com lucro, nome abreviado "Ana S."), vindo no `game/lobby`; histórico clicável com o detalhe da rodada (resultado, vento, nonce, seeds) e botão VERIFICAR que recalcula o vento no navegador (`public/js/game/fair.js`); painel "Sorteio verificável" para revelar/trocar a seed. A recuperação de rodada pendente já vinha do front antigo. 44/44 testes.

- Seleção de mapa e pipa, seletor de aposta com os limites do servidor e a tabela de pagamento.
- Histórico de rodadas com o link "verificar justiça" (seed revelada).
- Ranking e tela "como jogar".
- Recuperação de rodada pendente (reconexão), como o antigo fazia com `pipacombate_pending`.

### Fase 4: Carteira (sem gateway real)
- Saldo, extrato e ledger em centavos (já existe; revisar).
- Depósito com o **mock** (QR falso e confirmação manual pelo admin).
- Solicitação de saque (chave PIX + CPF validado) com aprovação no admin.
- Limites mínimo e máximo configuráveis.

### Fase 5: Indique e ganhe
- Código por usuário, link `/cadastro?ref=CODIGO` e atribuição no cadastro.
- Regra de comissão (a definir: % do depósito ou da receita líquida) e saldo de afiliado separado.
- Saque de afiliado com o mesmo fluxo de aprovação.

### Fase 6: Admin e configuração pública
- `GET /api/public/config` com os mesmos campos do antigo (valores rápidos, limites, popup e pixels).
- Painel: usuários, rodadas, depósitos, saques, afiliados, parâmetros do jogo (RTP, teto e % por rival) e auditoria.
- Jogo responsável: limites de depósito por usuário, autoexclusão e alertas.

### Fase 7: Marketing e PWA
- Pixels Meta, TikTok e Kwai e UTMify, ligados pelo admin (porte do `pixels.js`), com consentimento de cookies.
- Manifesto PWA, ícones e tela cheia.
- Textos honestos: nada de "moedas fictícias" se o saldo for real.

### Fase 8: Pagamentos (por último)
**Pré-requisito: operação autorizada (seção 6).**
- Integrar o gateway PIX escolhido: cobrança, webhook assinado, idempotência e conciliação.
- PIX de saída para os saques, com verificação de que o CPF da conta é o do titular.
- Testes de ponta a ponta no sandbox do gateway.

### Fase 9: Endurecimento e lançamento
- Revisão de segurança, carga, backup e restauração do banco, logs e alertas.
- Cloudflare na frente (como o antigo), domínio `pipacombate.online` e migração de DNS.
- **Deixado para o lançamento:** recuperar as contas da Hostinger (registrador, domínio válido até 19/10/2027) e da Cloudflare (DNS), criar a conta e a VM na Oracle Cloud Always Free e rodar `deploy/oracle/setup.sh`.

## 6. Ponto legal (fora da TI, para o responsável jurídico)

Aposta com dinheiro real no Brasil exige **autorização federal**. Normas de referência, vigentes desde 2024/2025 conforme a publicação de cada uma:
- **Lei 14.790/2023** (apostas de quota fixa, inclusive jogos on-line), publicada em 30/12/2023.
- Portarias da **Secretaria de Prêmios e Apostas (SPA/MF)** sobre autorização de operadores, meios de pagamento, jogo responsável e publicidade, editadas ao longo de 2024.
- **CDC (Lei 8.078/1990)**, art. 37: publicidade enganosa.
- **LGPD (Lei 13.709/2018)**: dados pessoais, CPF e telefone.

Não confirmei artigos específicos nem alterações posteriores a essas normas, como regras de bônus, certificação do gerador aleatório ou exigências de KYC. **Um advogado precisa confirmar a regra vigente antes da Fase 8.** Sem autorização, o caminho seguro é lançar só com moeda fictícia de verdade, sem depósito nem saque.

## 7. Decisões (27/10/2026)

| Tema | Decisão |
|---|---|
| Autorização | Já tem autorização federal. A Fase 8 segue, por último |
| Mecânica | **+% por tipo de rival** (igual ao antigo), sem teto secreto. Rivais com a mesma força em toda rodada |
| Visual | Antigo com ajustes (parte do CSS e da arte antigos, com cores, layout e logo renovados) |
| Cadastro | Só telefone (nome, telefone, senha, ref e aceite 18+). O CPF é pedido no saque |
| Afiliados | Configurável no admin: CPA (1º depósito), % de todo depósito ou RevShare, com percentual ajustável |
| Hospedagem | Grátis, sem Render. Recomendação: Oracle Cloud Always Free (ver nota) |

### Consequências técnicas da mecânica "+% por rival"

Sem teto sorteado, o ganho depende só dos cortes. Por isso **o servidor precisa impedir cortes inventados**:
- Os rivais são gerados pelo servidor (seed por rodada), com IDs. O cliente só pode informar o corte de um rival que existe e ainda está vivo.
- Validação de tempo: intervalo mínimo entre cortes, tempo mínimo de vida de cada rival e duração plausível da onda.
- Teto de ganho por rodada (`cap`, como no antigo) e limites de aposta.
- Monitoramento no admin: retorno por jogador acima do esperado gera alerta e trava saques para revisão.
- A margem da casa vem só da dificuldade, que é fixa e igual para todos. É preciso medir o RTP real em produção.

Confirmar com o jurídico se esse formato (jogo de habilidade, sem gerador aleatório decidindo o resultado) é compatível com a modalidade autorizada.

### Nota sobre hospedagem grátis (pesquisa em 27/10/2026, confirmar nas páginas oficiais)

| Opção | Situação |
|---|---|
| **Oracle Always Free** | VM ARM sempre ligada, até 2 OCPU e 12 GB (cota reduzida em 2026). Pede cartão para verificar. O deploy já está pronto em `deploy/oracle/` |
| Koyeb | 1 serviço com 512 MB e 0,1 vCPU que hiberna após 1 h sem tráfego. Postgres limitado a 5 h/mês. Pede cartão. Inviável para o jogo |
| Northflank | Sandbox com 2 serviços e 1 addon e recursos limitados. Pede cartão. Possível, mas apertado |
