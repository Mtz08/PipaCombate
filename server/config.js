// Configuracao central. Valores em CENTAVOS (inteiros) para dinheiro.
// Segredos vem SEMPRE do ambiente (.env em dev, variaveis do host em producao).

// Carrega .env se existir (Node >= 20.12). Em producao o host injeta as variaveis.
try { process.loadEnvFile(); } catch { /* sem .env: usa o ambiente */ }

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

const DEV_SECRET = 'dev-only-secret-nao-use-em-producao';

export const CONFIG = {
  env: env.NODE_ENV || 'development',
  isProd,
  isTest,
  port: Number(env.PORT) || 3000,
  // Atras de proxy/CDN (Nginx, Cloudflare): necessario para IP real no rate limit.
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : false,

  db: {
    // Postgres real. Sem ele, cai no PGlite local (so dev/teste).
    url: env.DATABASE_URL || null,
    pgliteDir: isTest ? 'memory://' : (env.PGLITE_DIR || './data/pglite'),
    poolMax: Number(env.DB_POOL_MAX) || 10,
    // Certificado (PEM) da CA do provedor, quando nao e uma CA publica (ex.: Supabase).
    // Em variavel de ambiente de uma linha, use \n no lugar das quebras.
    sslCa: env.DATABASE_SSL_CA ? env.DATABASE_SSL_CA.replace(/\\n/g, '\n') : null,
    // Aplica migrations ao subir. Em deploy com varias instancias pode-se
    // desligar e rodar `npm run migrate` como etapa do pipeline.
    autoMigrate: env.DB_AUTO_MIGRATE !== 'false',
  },

  sessionSecret: env.SESSION_SECRET || DEV_SECRET,
  // Chave para cifrar dados sensiveis em repouso (CPF do saque em analise) e
  // para o hash do CPF do titular. Obrigatoria em producao (min. 32 caracteres).
  dataKey: env.DATA_KEY || DEV_SECRET,
  sessionTtlMs: 1000 * 60 * 60 * 8, // 8h

  payments: {
    // 'mock' ate integrar o PSP. Trocar aqui + implementar o provider em server/payments/.
    provider: env.PAYMENTS_PROVIDER || 'mock',
    // Segredo para validar a assinatura (HMAC) dos webhooks do PSP.
    webhookSecret: env.PAYMENTS_WEBHOOK_SECRET || DEV_SECRET,
    // So no mock: confirma o deposito na hora, simulando o webhook do PSP.
    mockAutoConfirm: env.PAYMENTS_MOCK_AUTOCONFIRM !== 'false',
    chargeTtlMs: 1000 * 60 * 30, // cobranca PIX expira em 30 min
  },

  // Config publica entregue ao front em /api/public/config (sem dados sensiveis).
  public: {
    site_nome: 'Pipa Combate',
    ambiente: env.NODE_ENV || 'development',
    pagamento: (env.PAYMENTS_PROVIDER || 'mock').toUpperCase(),
    deposito_valores_rapidos: [20, 30, 40, 50, 100, 200],
    entrada_valores: [5, 10, 20, 30, 50, 100],
    fin: {
      deposito_minimo: 25,
      deposito_maximo: 10000,
      saque_minimo: 100,
      saque_maximo: 5000,
    },
  },

  // Limites financeiros em CENTAVOS (espelham o bloco publico acima).
  limits: {
    depositMinCents: 2500,
    depositMaxCents: 1000000,
    withdrawMinCents: 10000,
    withdrawMaxCents: 500000,
    // Saques ate este valor sao enviados direto ao PSP; acima, aguardam aprovacao
    // no admin. 0 = todo saque passa por aprovacao.
    withdrawAutoMaxCents: Number(env.WITHDRAW_AUTO_MAX_CENTS) || 0,
    betMinCents: 500,
    betMaxCents: 100000,
  },

  // Parametros matematicos do jogo. RTP (retorno ao jogador) no padrao de
  // mercado (95-97%). Ver domain/game.js para a derivacao do multiplicador.
  game: {
    rtpBps: 9600,          // 96,00%: retorno esperado de QUALQUER estrategia de saque
    maxMultX100: 5000,     // teto absoluto 50,00x
    minCutIntervalMs: 250, // cortes mais rapidos que isso sao recusados (anti-automacao)
    // somado ao multiplicador a cada corte, por tipo (centesimos: 10 = +0,10x)
    pctX100: { moleque: 10, veloz: 15, aparador: 15, pesadao: 25, cortador: 20, chefe: 100, aparar: 5 },
    maps: ['laje', 'campinho', 'morro', 'praia', 'tempestade', 'noite'], // ids de public/js/data.js
    forca: 1.4,            // forca das linhas rivais: a MESMA em toda rodada (ajusta a dificuldade)
    roundTtlMin: Number(env.ROUND_TTL_MIN) || 30, // round aberto alem disso e encerrado automaticamente
  },

  // Telefones que viram admin ao entrar (so digitos, separados por virgula).
  adminPhones: (env.ADMIN_PHONES || '').split(',').map((p) => p.replace(/\D/g, '')).filter(Boolean),

  signupBonusCents: Number(env.SIGNUP_BONUS_CENTS) || 0,

  // Versao vigente dos termos de uso; troque ao publicar um texto novo.
  termsVersion: env.TERMS_VERSION || '2026-10-27',
};

// Falha rapido em producao com configuracao insegura, em vez de subir vulneravel.
if (isProd) {
  const problems = [];
  if (!env.DATABASE_URL) problems.push('DATABASE_URL (PGlite nao e para producao)');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET (min. 32 caracteres)');
  if (!env.DATA_KEY || env.DATA_KEY.length < 32) problems.push('DATA_KEY (min. 32 caracteres)');
  if (CONFIG.payments.provider !== 'mock' && (!env.PAYMENTS_WEBHOOK_SECRET || env.PAYMENTS_WEBHOOK_SECRET.length < 32)) {
    problems.push('PAYMENTS_WEBHOOK_SECRET (min. 32 caracteres)');
  }
  if (problems.length) {
    throw new Error(`Configuracao invalida para producao: ${problems.join(', ')}`);
  }
}
