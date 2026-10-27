/* Pipa Combate — preferências do aparelho (pipa, cenário, bonequinho, som, controle, estilo visual).
   Saldo e apostas ficam no servidor, não aqui. */
import { SKINS, MAPS, PELES, KID, randomKid } from './data.js?v=d21';

const KEY = 'pipacombate_prefs_v3';

const DEF = {
  skin: 'classica', map: 'laje', stake: 100, kid: null, tips: true,
  opt: { music: true, sfx: true, narr: true, crowd: true, vib: true, ctrl: 'arrastar', sens: 1.6, fx: 'alto', style: 'cartoon' },
};
const valid = (k, v) => KID[k].some(o => o[0] === v);

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const o = Object.assign(JSON.parse(JSON.stringify(DEF)), s);
  o.opt = Object.assign({}, DEF.opt, s.opt || {});
  if (!o.v8) { o.opt.sens = 1.6; o.v8 = true; }
  if (o.opt.ctrl === 'relativo') o.opt.ctrl = 'arrastar';
  if (o.opt.ctrl === 'direto') o.opt.ctrl = 'dedo';
  if (!['arrastar', 'joystick', 'dedo'].includes(o.opt.ctrl)) o.opt.ctrl = 'arrastar';
  if (!['cartoon', 'pixel'].includes(o.opt.style)) o.opt.style = 'cartoon';
  if (!SKINS.some(k => k.id === o.skin)) o.skin = 'classica';
  if (!MAPS.some(k => k.id === o.map)) o.map = 'laje';
  // bonequinho: completa campos novos e corrige valores antigos
  const old = o.kid || {};
  const kid = randomKid();
  for (const k in kid) if (old[k] !== undefined) kid[k] = old[k];
  if (!PELES.includes(kid.pele)) kid.pele = PELES[4];
  for (const k of Object.keys(KID)) if (!valid(k, kid[k])) kid[k] = KID[k][0][0];
  o.kid = kid;
  return o;
}

export const P = load();
export function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
export function rerollKid() { P.kid = randomKid(); save(); }
export const skinById = id => SKINS.find(k => k.id === id) || SKINS[0];
export const mapById = id => MAPS.find(k => k.id === id) || MAPS[0];
