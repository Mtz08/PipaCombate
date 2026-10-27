/* Pipa Combate — rastreio de marketing (Pixel do Meta, Pixel do TikTok e UTMify).
   - Guarda as UTMs da 1ª visita (vão no cadastro para atribuir a campanha).
   - Pixels só carregam depois que o visitante aceita os cookies de marketing (LGPD).
   - IDs vêm da config pública (/api/public/config), editável no painel.
   - window.PCPixel.track(evento, dados) dispara nos pixels ativos.
   - Nada aqui pode quebrar o jogo: tudo em try/catch. */
(function () {
  var CONSENT_KEY = 'pc_consent';
  var queue = [], ready = false, cfg = {};

  // ---------- 1) UTMs da primeira visita ----------
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'src', 'sck', 'xcod'];
  var utm = {};
  try {
    utm = JSON.parse(localStorage.getItem('pg_track') || '{}') || {};
    var qs = new URLSearchParams(location.search), changed = false;
    KEYS.forEach(function (k) { var v = qs.get(k); if (v && !utm[k]) { utm[k] = String(v).slice(0, 200); changed = true; } });
    if (changed) localStorage.setItem('pg_track', JSON.stringify(utm));
  } catch (e) {}

  function consent() { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }
  function setConsent(v) { try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {} }

  // ---------- 2) carregadores oficiais dos pixels ----------
  function loadMeta(id) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', String(id)); window.fbq('track', 'PageView');
  }
  function loadTikTok(id) {
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      ttq.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (n) { for (var e = ttq._i[n] || [], j = 0; j < ttq.methods.length; j++) ttq.setAndDefer(e, ttq.methods[j]); return e; };
      ttq.load = function (e, n) {
        var u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = u; ttq._t = ttq._t || {}; ttq._t[e] = +new Date; ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        var o = d.createElement('script'); o.type = 'text/javascript'; o.async = !0; o.src = u + '?sdkid=' + e + '&lib=' + t;
        var a = d.getElementsByTagName('script')[0]; a.parentNode.insertBefore(o, a);
      };
      ttq.load(String(id)); ttq.page();
    }(window, document, 'ttq');
  }
  function loadScript(src, attrs) {
    var s = document.createElement('script'); s.async = true; s.defer = true; s.src = src;
    Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    document.head.appendChild(s);
  }

  function start() {
    if (ready) return;
    ready = true;
    try { if (cfg.pixel_meta_id) loadMeta(cfg.pixel_meta_id); } catch (e) {}
    try { if (cfg.pixel_tiktok_id) loadTikTok(cfg.pixel_tiktok_id); } catch (e) {}
    try { if (cfg.utmify_utms) loadScript('https://cdn.utmify.com.br/scripts/utms/latest.js', { 'data-utmify-prevent-xcod-sck': '', 'data-utmify-prevent-subids': '' }); } catch (e) {}
    try { if (cfg.utmify_pixel_id) { window.pixelId = String(cfg.utmify_pixel_id); loadScript('https://cdn.utmify.com.br/scripts/pixel/pixel.js'); } } catch (e) {}
    queue.splice(0).forEach(function (a) { send(a[0], a[1]); });
  }

  // ---------- 3) eventos ----------
  // cadastro -> CompleteRegistration | iniciou_deposito -> InitiateCheckout | deposito -> Purchase
  function send(ev, d) {
    d = d || {};
    var valor = { value: Number(d.reais) || 0, currency: 'BRL' };
    try {
      if (window.fbq) {
        if (ev === 'cadastro') window.fbq('track', 'CompleteRegistration');
        else if (ev === 'iniciou_deposito') window.fbq('track', 'InitiateCheckout', valor);
        else if (ev === 'deposito') window.fbq('track', 'Purchase', valor, d.id ? { eventID: 'dep_' + d.id } : undefined);
      }
    } catch (e) {}
    try {
      if (window.ttq) {
        if (ev === 'cadastro') window.ttq.track('CompleteRegistration');
        else if (ev === 'iniciou_deposito') window.ttq.track('InitiateCheckout', valor);
        else if (ev === 'deposito') window.ttq.track('CompletePayment', valor, d.id ? { event_id: 'dep_' + d.id } : undefined);
      }
    } catch (e) {}
  }

  window.PCPixel = {
    track: function (ev, d) { if (consent() !== 'sim') return; if (ready) send(ev, d); else queue.push([ev, d]); },
    utm: function () { return Object.keys(utm).length ? utm : null; },
  };

  // ---------- 4) aviso de cookies (só se houver algum pixel configurado) ----------
  function banner() {
    var el = document.createElement('div');
    el.className = 'cookie-bar';
    el.setAttribute('role', 'dialog');
    el.innerHTML = '<p>Usamos cookies de marketing para medir nossos anúncios. Veja a <a href="/privacidade.html" target="_blank" rel="noopener">política de privacidade</a>.</p>'
      + '<div><button type="button" data-c="nao">Recusar</button><button type="button" data-c="sim" class="ok">Aceitar</button></div>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-c]'); if (!b) return;
      setConsent(b.getAttribute('data-c')); el.remove();
      if (b.getAttribute('data-c') === 'sim') start();
    });
    document.body.appendChild(el);
  }

  // config pública compartilhada com o jogo (popup etc.)
  window.PCConfig = fetch('/api/public/config', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then(function (r) { return r.json(); })
    .catch(function () { return {}; });
  window.PCConfig.then(function (c) {
    cfg = c || {};
    var temPixel = cfg.pixel_meta_id || cfg.pixel_tiktok_id || cfg.utmify_pixel_id || cfg.utmify_utms;
    if (!temPixel) return;
    var ok = consent();
    if (ok === 'sim') start();
    else if (!ok) banner();
  });
})();
