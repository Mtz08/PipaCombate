// Repositorios: SQL de cada tabela num lugar so. Toda funcao recebe o
// executor `q` (db ou a transacao corrente) como 1o argumento, assim a mesma
// funcao serve dentro e fora de transacao. Linhas saem em camelCase.

const ms = (d) => (d ? new Date(d).getTime() : null);

// ---------- users ----------

export function mapUser(r) {
  return r && {
    id: r.id, name: r.name, phone: r.phone, passwordHash: r.password_hash, ref: r.ref,
    referralCode: r.referral_code, balanceCents: r.balance_cents,
    sessionVersion: r.session_version, createdAt: ms(r.created_at), role: r.role,
    referredBy: r.referred_by ?? null, termsAcceptedAt: ms(r.terms_accepted_at), termsVersion: r.terms_version ?? null,
    cpfHash: r.cpf_hash ?? null,
    depLimitCents: r.dep_limit_cents == null ? null : Number(r.dep_limit_cents), depLimitPeriod: r.dep_limit_period ?? null,
    depLimitNextCents: r.dep_limit_next_cents == null ? null : Number(r.dep_limit_next_cents), depLimitNextPeriod: r.dep_limit_next_period ?? null,
    depLimitNextAt: ms(r.dep_limit_next_at), depLimitNextSet: !!r.dep_limit_next_set, selfExcludedUntil: ms(r.self_excluded_until),
  };
}

export const Users = {
  async getById(q, id) {
    return mapUser((await q.query('SELECT * FROM users WHERE id = $1', [id]))[0]) || null;
  },
  async getByPhone(q, phone) {
    return mapUser((await q.query('SELECT * FROM users WHERE phone = $1', [phone]))[0]) || null;
  },
  async getByReferralCode(q, code) {
    return mapUser((await q.query('SELECT * FROM users WHERE referral_code = $1', [code]))[0]) || null;
  },
  async create(q, { name, phone, passwordHash, ref, referralCode, referredBy = null, termsVersion = null }) {
    const rows = await q.query(
      `INSERT INTO users (name, phone, password_hash, ref, referral_code, referred_by, terms_accepted_at, terms_version)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::text IS NULL THEN NULL ELSE now() END, $7) RETURNING *`,
      [name, phone, passwordHash, ref, referralCode, referredBy, termsVersion],
    );
    return mapUser(rows[0]);
  },
  /** Soma delta ao saldo e devolve o novo saldo. CHECK no banco barra negativo. */
  async addBalance(q, id, deltaCents) {
    const rows = await q.query(
      'UPDATE users SET balance_cents = balance_cents + $2 WHERE id = $1 RETURNING balance_cents',
      [id, deltaCents],
    );
    return rows[0].balance_cents;
  },
  async setRole(q, id, role) {
    await q.query('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
  },
  /** Vincula o CPF (hash) do titular na primeira vez; depois nao muda. */
  async setCpfHash(q, id, hash) {
    await q.query('UPDATE users SET cpf_hash = $2 WHERE id = $1 AND cpf_hash IS NULL', [id, hash]);
  },
  async bumpSessionVersion(q, id) {
    await q.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [id]);
  },
};

// ---------- ledger (append-only) ----------

const mapLedger = (r) => ({
  id: r.id, type: r.type, deltaCents: r.delta_cents, balanceAfter: r.balance_after,
  at: ms(r.created_at), ...r.meta,
});

export const Ledger = {
  async append(q, { userId, type, deltaCents, balanceAfter, meta = {} }) {
    await q.query(
      `INSERT INTO ledger (user_id, type, delta_cents, balance_after, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, deltaCents, balanceAfter, JSON.stringify(meta)],
    );
  },
  async recent(q, userId, limit = 20) {
    const rows = await q.query(
      'SELECT * FROM ledger WHERE user_id = $1 ORDER BY id DESC LIMIT $2', [userId, limit],
    );
    return rows.map(mapLedger);
  },
};

// ---------- rounds ----------

const mapRound = (r) => r && {
  id: r.id, userId: r.user_id, betCents: r.bet_cents, map: r.map, state: r.state,
  cuts: r.cuts, prizeCents: r.prize_cents, createdAt: ms(r.created_at), closedAt: ms(r.closed_at),
  seedId: r.seed_id, nonce: r.nonce, forfeit: r.forfeit,
  ceilingX100: r.ceiling_x100, multX100: r.mult_x100, counts: r.counts || {},
  lastCutAt: ms(r.last_cut_at), endReason: r.end_reason,
  rtpBps: r.rtp_bps ?? 9600, maxMultX100: r.max_mult_x100 ?? 5000,
};

export const Rounds = {
  async get(q, id) {
    return mapRound((await q.query('SELECT * FROM rounds WHERE id = $1', [id]))[0]) || null;
  },
  async openByUser(q, userId) {
    return mapRound((await q.query(
      "SELECT * FROM rounds WHERE user_id = $1 AND state = 'open'", [userId],
    ))[0]) || null;
  },
  async create(q, { userId, betCents, map, seedId, nonce, ceilingX100, rtpBps = 9600, maxMultX100 = 5000 }) {
    return mapRound((await q.query(
      `INSERT INTO rounds (user_id, bet_cents, map, seed_id, nonce, ceiling_x100, rtp_bps, max_mult_x100)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, betCents, map, seedId, nonce, ceilingX100, rtpBps, maxMultX100],
    ))[0]);
  },
  /** Registra um corte: soma ao multiplicador e a contagem do tipo. */
  async recordCut(q, id, kind, multX100) {
    return mapRound((await q.query(
      `UPDATE rounds
          SET cuts = cuts + 1, mult_x100 = $3, last_cut_at = now(),
              counts = jsonb_set(counts, ARRAY[$2::text], to_jsonb(COALESCE((counts->>$2)::int, 0) + 1))
        WHERE id = $1 AND state = 'open' RETURNING *`,
      [id, kind, multX100],
    ))[0]);
  },
  /** Maiores lucros recentes (ranking publico): so rodadas sacadas com lucro. */
  async topWins(q, { days = 7, limit = 10 } = {}) {
    const rows = await q.query(
      `SELECT u.name, r.map, r.bet_cents, r.prize_cents, r.closed_at
         FROM rounds r JOIN users u ON u.id = r.user_id
        WHERE r.state = 'cashed' AND r.prize_cents > r.bet_cents
          AND r.closed_at > now() - make_interval(days => $1)
        ORDER BY (r.prize_cents - r.bet_cents) DESC, r.closed_at DESC LIMIT $2`,
      [days, limit],
    );
    return rows.map((r) => ({ name: r.name, map: r.map, betCents: Number(r.bet_cents), prizeCents: Number(r.prize_cents), at: ms(r.closed_at) }));
  },
  /** Historico com dados de verificacao. server_seed so sai se ja revelada. */
  async history(q, userId, limit = 20) {
    const rows = await q.query(
      `SELECT r.*, f.server_seed_hash, f.client_seed,
              CASE WHEN f.revealed_at IS NOT NULL THEN f.server_seed END AS revealed_seed
         FROM rounds r LEFT JOIN fair_seeds f ON f.id = r.seed_id
        WHERE r.user_id = $1 AND r.state <> 'open'
        ORDER BY r.created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => ({
      ...mapRound(r), serverSeedHash: r.server_seed_hash, clientSeed: r.client_seed, serverSeed: r.revealed_seed ?? null,
    }));
  },
  async close(q, id, state, prizeCents, endReason) {
    return mapRound((await q.query(
      `UPDATE rounds SET state = $2, prize_cents = $3, end_reason = $4, forfeit = ($4 = 'forfeit'), closed_at = now()
       WHERE id = $1 AND state = 'open' RETURNING *`,
      [id, state, prizeCents, endReason],
    ))[0]);
  },
};

// ---------- charges (deposito) ----------

const mapCharge = (r) => r && {
  id: r.id, userId: r.user_id, amountCents: r.amount_cents, status: r.status,
  provider: r.provider, providerRef: r.provider_ref, copyPaste: r.copy_paste,
  qrCodeBase64: r.qr_code, expiresAt: ms(r.expires_at), paidAt: ms(r.paid_at), createdAt: ms(r.created_at),
};

export const Charges = {
  async hasPaid(q, userId) {
    return (await q.query("SELECT 1 FROM charges WHERE user_id = $1 AND status = 'paid' LIMIT 1", [userId])).length > 0;
  },
  async recentByUser(q, userId, limit = 20) {
    return (await q.query('SELECT * FROM charges WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])).map(mapCharge);
  },
  async get(q, id) {
    return mapCharge((await q.query('SELECT * FROM charges WHERE id = $1', [id]))[0]) || null;
  },
  async getByRef(q, ref, { forUpdate = false } = {}) {
    return mapCharge((await q.query(
      `SELECT * FROM charges WHERE provider_ref = $1${forUpdate ? ' FOR UPDATE' : ''}`, [ref],
    ))[0]) || null;
  },
  async create(q, { userId, amountCents, provider, expiresAt }) {
    return mapCharge((await q.query(
      `INSERT INTO charges (user_id, amount_cents, provider, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, amountCents, provider, new Date(expiresAt)],
    ))[0]);
  },
  async attachPix(q, id, { providerRef, copyPaste, qrCodeBase64 }) {
    return mapCharge((await q.query(
      `UPDATE charges SET provider_ref = $2, copy_paste = $3, qr_code = $4
       WHERE id = $1 RETURNING *`,
      [id, providerRef, copyPaste, qrCodeBase64],
    ))[0]);
  },
  async setStatus(q, id, status) {
    return mapCharge((await q.query(
      `UPDATE charges SET status = $2, paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE paid_at END
       WHERE id = $1 RETURNING *`,
      [id, status],
    ))[0]);
  },
};

// ---------- withdrawals (saque) ----------

const mapWithdrawal = (r) => r && {
  id: r.id, userId: r.user_id, amountCents: r.amount_cents, status: r.status,
  pixKey: r.pix_key, pixKeyMask: r.pix_key_mask, providerRef: r.provider_ref, cpfEnc: r.cpf_enc ?? null, source: r.source || 'balance',
  reviewedBy: r.reviewed_by ?? null, reviewedAt: ms(r.reviewed_at), reviewNote: r.review_note ?? null,
  createdAt: ms(r.created_at), updatedAt: ms(r.updated_at),
};

export const Withdrawals = {
  async get(q, id, { forUpdate = false } = {}) {
    return mapWithdrawal((await q.query(`SELECT * FROM withdrawals WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [id]))[0]) || null;
  },
  async create(q, { userId, amountCents, pixKey, pixKeyMask, provider, status = 'processing', cpfEnc = null, source = 'balance' }) {
    return mapWithdrawal((await q.query(
      `INSERT INTO withdrawals (user_id, amount_cents, pix_key, pix_key_mask, provider, status, cpf_enc, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, amountCents, pixKey, pixKeyMask, provider, status, cpfEnc, source],
    ))[0]);
  },
  /** Atualiza status; ao finalizar (paid/failed/rejected) apaga chave e CPF (LGPD). */
  async finish(q, id, { status, providerRef = null }) {
    return mapWithdrawal((await q.query(
      `UPDATE withdrawals
         SET status = $2, provider_ref = COALESCE($3, provider_ref), updated_at = now(),
             pix_key = CASE WHEN $2 IN ('paid','failed','rejected') THEN NULL ELSE pix_key END,
             cpf_enc = CASE WHEN $2 = 'review' THEN cpf_enc ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [id, status, providerRef],
    ))[0]);
  },
  async markReviewed(q, id, { by, note = null }) {
    return mapWithdrawal((await q.query(
      'UPDATE withdrawals SET reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE id = $1 RETURNING *',
      [id, by, note],
    ))[0]);
  },
  /** Saque ainda em andamento (aguardando aprovacao ou no PSP). */
  async pendingByUser(q, userId) {
    return mapWithdrawal((await q.query(
      `SELECT * FROM withdrawals WHERE user_id = $1 AND status IN ('review','processing') LIMIT 1`, [userId],
    ))[0]) || null;
  },
  async recentByUser(q, userId, limit = 20) {
    return (await q.query('SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])).map(mapWithdrawal);
  },
  /** Fila do admin: aguardando aprovacao, mais antigos primeiro. */
  async reviewQueue(q, limit = 100) {
    const rows = await q.query(
      `SELECT w.*, u.name AS user_name, u.phone AS user_phone, u.balance_cents AS user_balance, u.created_at AS user_since
         FROM withdrawals w JOIN users u ON u.id = w.user_id
        WHERE w.status = 'review' ORDER BY w.created_at LIMIT $1`, [limit],
    );
    return rows.map((r) => ({ ...mapWithdrawal(r), userName: r.user_name, userPhone: r.user_phone, userBalanceCents: Number(r.user_balance), userSince: ms(r.user_since) }));
  },
};

// ---------- fair_seeds (provably fair) ----------

const mapSeed = (r) => r && {
  id: r.id, userId: r.user_id, serverSeed: r.server_seed, serverSeedHash: r.server_seed_hash,
  clientSeed: r.client_seed, nonce: r.nonce, active: r.active, revealedAt: ms(r.revealed_at),
};

export const FairSeeds = {
  async get(q, id) {
    return mapSeed((await q.query('SELECT * FROM fair_seeds WHERE id = $1', [id]))[0]) || null;
  },
  async active(q, userId, { forUpdate = false } = {}) {
    return mapSeed((await q.query(
      `SELECT * FROM fair_seeds WHERE user_id = $1 AND active${forUpdate ? ' FOR UPDATE' : ''}`, [userId],
    ))[0]) || null;
  },
  async create(q, { userId, serverSeed, serverSeedHash, clientSeed }) {
    return mapSeed((await q.query(
      `INSERT INTO fair_seeds (user_id, server_seed, server_seed_hash, client_seed)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, serverSeed, serverSeedHash, clientSeed],
    ))[0]);
  },
  /** Consome o proximo nonce e devolve o valor usado. */
  async takeNonce(q, id) {
    const rows = await q.query('UPDATE fair_seeds SET nonce = nonce + 1 WHERE id = $1 RETURNING nonce', [id]);
    return rows[0].nonce - 1;
  },
  async reveal(q, id) {
    await q.query('UPDATE fair_seeds SET active = false, revealed_at = now() WHERE id = $1', [id]);
  },
  async lastRevealed(q, userId) {
    return mapSeed((await q.query(
      'SELECT * FROM fair_seeds WHERE user_id = $1 AND revealed_at IS NOT NULL ORDER BY revealed_at DESC LIMIT 1',
      [userId],
    ))[0]) || null;
  },
};
