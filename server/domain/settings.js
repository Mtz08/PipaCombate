// Configuracoes editaveis pelo admin, guardadas na tabela settings (chave -> JSON).
// Cada chave tem um padrao e um validador; o valor salvo e sempre normalizado.
// O padrao e lido do CONFIG na hora (ambiente/testes podem mudar) e o que foi
// salvo pelo admin sobrepoe. So a linha do banco fica em cache curto.

import { db, tx } from '../db/index.js';
import { domainError } from '../util/money.js';
import { CONFIG } from '../config.js';

const TTL_MS = 5000;
const cache = new Map();

const bad = (msg) => domainError('INVALID_SETTING', msg);
const int = (v, min, max, campo) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${campo}: valor fora do permitido (${min} a ${max})`);
  return n;
};
const num = (v, min, max, campo) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${campo}: valor fora do permitido (${min} a ${max})`);
  return Math.round(n * 100) / 100;
};
const texto = (v, max, campo) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (s.length > max) throw bad(`${campo}: maximo de ${max} caracteres`);
  return s;
};
const COR = /^#[0-9a-f]{6}$/i;
const KINDS = ['moleque', 'veloz', 'aparador', 'pesadao', 'cortador', 'chefe', 'aparar'];

/** Padroes e validacao de cada chave. */
export const SCHEMAS = {
  afiliados: {
    padrao: () => ({
      ativo: true,
      modelo: 'deposito',             // 'cpa' | 'deposito' | 'revshare'
      niveisPct: [10, 5, 3],           // % por nivel (deposito e revshare)
      cpaCents: [1000, 0, 0],          // valor fixo por nivel (cpa), pago no 1o deposito
      cpaDepositoMinCents: 2500,       // deposito minimo para liberar o CPA
      saqueMinCents: 3000,
      saqueMaxCents: 500000,
    }),
    validar(v) {
      const modelo = ['cpa', 'deposito', 'revshare'].includes(v.modelo) ? v.modelo : null;
      if (!modelo) throw bad('modelo: use cpa, deposito ou revshare');
      const tres = (arr, max, campo) => {
        if (!Array.isArray(arr) || arr.length !== 3) throw bad(`${campo}: informe 3 niveis`);
        return arr.map((x, i) => int(x, 0, max, `${campo} nivel ${i + 1}`));
      };
      const out = {
        ativo: v.ativo !== false,
        modelo,
        niveisPct: tres(v.niveisPct, 50, 'percentual'),
        cpaCents: tres(v.cpaCents, 100000, 'CPA'),
        cpaDepositoMinCents: int(v.cpaDepositoMinCents, 0, 1000000, 'deposito minimo do CPA'),
        saqueMinCents: int(v.saqueMinCents, 100, 10000000, 'saque minimo'),
        saqueMaxCents: int(v.saqueMaxCents, 100, 10000000, 'saque maximo'),
      };
      if (out.saqueMaxCents < out.saqueMinCents) throw bad('saque maximo menor que o minimo');
      if (out.niveisPct.reduce((a, b) => a + b, 0) > 60) throw bad('soma dos percentuais acima de 60%');
      return out;
    },
  },

  // Parametros do jogo. Mudancas valem para as PROXIMAS rodadas: cada rodada
  // guarda o RTP e o teto com que o vento foi sorteado (verificacao continua valendo).
  jogo: {
    padrao: () => ({
      rtpBps: CONFIG.game.rtpBps,
      maxMultX100: CONFIG.game.maxMultX100,
      pctX100: { ...CONFIG.game.pctX100 },
      forca: CONFIG.game.forca,
      betMinCents: CONFIG.limits.betMinCents,
      betMaxCents: CONFIG.limits.betMaxCents,
    }),
    validar(v) {
      const pct = {};
      for (const k of KINDS) pct[k] = int(v.pctX100?.[k], 1, 500, `% do ${k}`);
      const out = {
        rtpBps: int(v.rtpBps, 9000, 9900, 'RTP (centesimos de %)'),
        maxMultX100: int(v.maxMultX100, 200, 10000, 'ganho maximo'),
        pctX100: pct,
        forca: num(v.forca, 0.5, 3, 'forca dos rivais'),
        betMinCents: int(v.betMinCents, 100, 10000000, 'aposta minima'),
        betMaxCents: int(v.betMaxCents, 100, 10000000, 'aposta maxima'),
      };
      if (out.betMaxCents < out.betMinCents) throw bad('aposta maxima menor que a minima');
      return out;
    },
  },

  limites: {
    padrao: () => ({
      depositMinCents: CONFIG.limits.depositMinCents,
      depositMaxCents: CONFIG.limits.depositMaxCents,
      withdrawMinCents: CONFIG.limits.withdrawMinCents,
      withdrawMaxCents: CONFIG.limits.withdrawMaxCents,
      withdrawAutoMaxCents: CONFIG.limits.withdrawAutoMaxCents,
      rolloverPct: 100, // % do deposito que precisa ser apostado antes de sacar (0 = desliga)
    }),
    validar(v) {
      const out = {
        depositMinCents: int(v.depositMinCents, 100, 100000000, 'deposito minimo'),
        depositMaxCents: int(v.depositMaxCents, 100, 100000000, 'deposito maximo'),
        withdrawMinCents: int(v.withdrawMinCents, 100, 100000000, 'saque minimo'),
        withdrawMaxCents: int(v.withdrawMaxCents, 100, 100000000, 'saque maximo'),
        withdrawAutoMaxCents: int(v.withdrawAutoMaxCents, 0, 100000000, 'saque automatico ate'),
        rolloverPct: int(v.rolloverPct, 0, 1000, 'rollover do deposito (%)'),
      };
      if (out.depositMaxCents < out.depositMinCents) throw bad('deposito maximo menor que o minimo');
      if (out.withdrawMaxCents < out.withdrawMinCents) throw bad('saque maximo menor que o minimo');
      return out;
    },
  },

  // Bonus de primeiro deposito. Nasce DESLIGADO. O bonus entra no saldo e soma
  // ao rollover (bonus x rolloverX): so da para sacar depois de apostar isso.
  // Com RTP r, o custo esperado de cumprir o rollover e rolloverX x (1 - r) do
  // bonus: com 90% e 10x, o bonus "se paga" em media antes de virar saque.
  bonus: {
    padrao: () => ({ ativo: false, pct: 100, maxCents: 10000, minDepositoCents: 1000, rolloverX: 10 }),
    validar(v) {
      const out = {
        ativo: v.ativo === true,
        pct: int(v.pct, 1, 300, 'percentual do bonus'),
        maxCents: int(v.maxCents, 100, 10000000, 'teto do bonus'),
        minDepositoCents: int(v.minDepositoCents, 100, 10000000, 'deposito minimo para ganhar o bonus'),
        rolloverX: int(v.rolloverX, 1, 100, 'rollover do bonus (x)'),
      };
      return out;
    },
  },

  // Pixels de anuncio. Sao publicos por natureza (vao para o navegador), so
  // carregam depois do consentimento de cookies do visitante.
  marketing: {
    padrao: () => ({ metaPixelId: '', tiktokPixelId: '', utmifyPixelId: '', utmifyUtms: false }),
    validar(v) {
      const id = (x, re, campo) => { const s = String(x ?? '').trim(); if (s && !re.test(s)) throw bad(`${campo}: formato invalido`); return s; };
      return {
        metaPixelId: id(v.metaPixelId, /^\d{5,20}$/, 'Pixel do Meta'),
        tiktokPixelId: id(v.tiktokPixelId, /^[A-Z0-9]{10,30}$/i, 'Pixel do TikTok'),
        utmifyPixelId: id(v.utmifyPixelId, /^[a-f0-9-]{8,40}$/i, 'Pixel da UTMify'),
        utmifyUtms: v.utmifyUtms !== false,
      };
    },
  },

  // Textos e botoes publicos (sem login): nome, botoes de deposito rapido, suporte.
  publico: {
    padrao: () => ({
      siteNome: 'Pipa Combate',
      depositoRapidoCents: [1000, 2000, 3000, 5000, 10000, 20000],
      depositoRotulos: { 1000: 'MÍNIMO', 2000: 'BOM', 3000: 'ÓTIMO', 5000: 'EXCELENTE', 10000: 'TOP', 20000: 'VIP' },
      depositoCores: { 1000: '#16a34a', 2000: '#f59e0b', 3000: '#ef5d00', 5000: '#e11d48', 10000: '#7c3aed', 20000: '#450d59' },
      suporte: [], // [{ nome, url }]
      rodapeLegal: '', // ex.: empresa, CNPJ e numero da autorizacao (aparece no rodape)
      popup: { ativo: false, titulo: '', mensagem: '', imagemUrl: '', botaoTexto: '', botaoAcao: 'fechar', botaoUrl: '', frequencia: 'sessao' },
    }),
    validar(v) {
      if (!Array.isArray(v.depositoRapidoCents) || !v.depositoRapidoCents.length || v.depositoRapidoCents.length > 8) throw bad('botoes de deposito: de 1 a 8 valores');
      const chips = [...new Set(v.depositoRapidoCents.map((c, i) => int(c, 100, 100000000, `botao ${i + 1}`)))].sort((a, b) => a - b);
      const rotulos = {}, cores = {};
      for (const c of chips) {
        const r = texto(v.depositoRotulos?.[c], 14, 'rotulo do botao');
        if (r) rotulos[c] = r;
        const cor = String(v.depositoCores?.[c] ?? '');
        if (cor) { if (!COR.test(cor)) throw bad(`cor do botao ${c / 100}: use #rrggbb`); cores[c] = cor.toLowerCase(); }
      }
      if (!Array.isArray(v.suporte) || v.suporte.length > 5) throw bad('suporte: ate 5 links');
      const suporte = v.suporte.map((s) => {
        const url = texto(s?.url, 300, 'link de suporte');
        if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) throw bad('link de suporte: use um endereco https://');
        return { nome: texto(s?.nome, 30, 'nome do suporte') || 'Suporte', url };
      });
      const p = v.popup || {};
      const https = (u, campo) => { const s = texto(u, 400, campo); if (s && !/^https:\/\/[^\s"'<>]+$/i.test(s)) throw bad(`${campo}: use um endereco https://`); return s; };
      const popup = {
        ativo: p.ativo === true,
        titulo: texto(p.titulo, 60, 'titulo do popup'),
        mensagem: texto(p.mensagem, 400, 'mensagem do popup'),
        imagemUrl: https(p.imagemUrl, 'imagem do popup'),
        botaoTexto: texto(p.botaoTexto, 30, 'texto do botao do popup'),
        botaoAcao: ['fechar', 'depositar', 'indicar', 'link'].includes(p.botaoAcao) ? p.botaoAcao : 'fechar',
        botaoUrl: https(p.botaoUrl, 'link do botao do popup'),
        frequencia: ['sessao', 'diaria', 'sempre'].includes(p.frequencia) ? p.frequencia : 'sessao',
      };
      if (popup.ativo && !popup.titulo && !popup.mensagem && !popup.imagemUrl) throw bad('popup ativo precisa de titulo, mensagem ou imagem');
      if (popup.botaoAcao === 'link' && !popup.botaoUrl) throw bad('popup: informe o link do botao');
      return {
        siteNome: texto(v.siteNome, 40, 'nome do site') || 'Pipa Combate', depositoRapidoCents: chips, depositoRotulos: rotulos, depositoCores: cores,
        suporte, popup, rodapeLegal: texto(v.rodapeLegal, 300, 'texto legal do rodape'),
      };
    },
  },
};

/** Le a configuracao. Dentro de transacao, passe o executor `q` (PGlite tem
 *  uma conexao so: consultar `db` com a transacao aberta trava). */
export async function getSetting(key, q = db) {
  const s = SCHEMAS[key];
  if (!s) throw new Error(`setting desconhecida: ${key}`);
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at >= TTL_MS) {
    const row = (await q.query('SELECT value FROM settings WHERE key = $1', [key]))[0];
    hit = { saved: row ? row.value : null, at: Date.now() };
    cache.set(key, hit);
  }
  return { ...s.padrao(), ...(hit.saved || {}) };
}

/** Salva (validado) e devolve o valor final. Auditoria fica com quem chama.
 *  value = null volta ao padrao. */
export async function setSetting(key, value, actorId) {
  const s = SCHEMAS[key];
  if (!s) throw domainError('NOT_FOUND', 'Configuracao inexistente', 404);
  if (value === null) {
    await tx((t) => t.query('DELETE FROM settings WHERE key = $1', [key]));
    cache.delete(key);
    return s.padrao();
  }
  const clean = s.validar({ ...s.padrao(), ...(value || {}) });
  await tx((t) => t.query(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(clean), actorId],
  ));
  cache.delete(key);
  return clean;
}
