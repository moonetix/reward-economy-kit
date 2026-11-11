// reward-economy-kit: integer-only math for a rewards currency.
// Money is held in USD micro-units (1 USD = 1,000,000) and points in integer
// units of the currency's smallest step. All arithmetic uses BigInt.

export const USD_DECIMALS = 6;
export const MAX_AMOUNT = 9223372036854775807n; // 2^63 - 1, the PHP_INT_MAX of the PHP port
export const MAX_DECIMALS = 6;
export const MAX_BONUS_BPS = 1_000_000;
export const ROUNDING_MODES = Object.freeze(['floor', 'ceil', 'half-up', 'half-even']);

const BPS = 10_000n;
const MICRO = 1_000_000n;

function pow10(n) {
  return 10n ** BigInt(n);
}

function toAmount(value, name, { allowNegative = false } = {}) {
  let v;
  if (typeof value === 'bigint') v = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) v = BigInt(value);
  else throw new TypeError(`${name} must be a bigint or a safe integer, got ${typeof value === 'number' ? value : typeof value}`);
  const min = allowNegative ? -MAX_AMOUNT : 0n;
  if (v < min || v > MAX_AMOUNT) throw new RangeError(`${name} is out of range`);
  return v;
}

function toInt(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${name} must be an integer`);
  if (value < min || value > max) throw new RangeError(`${name} must be from ${min} to ${max}`);
  return value;
}

function checkResult(v, name = 'result') {
  if (v > MAX_AMOUNT || v < -MAX_AMOUNT) throw new RangeError(`${name} exceeds MAX_AMOUNT`);
  return v;
}

function parseDecimal(text, decimals, name) {
  if (typeof text !== 'string') throw new TypeError(`${name} must be a string`);
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new RangeError(`${name} must be a plain decimal like 12 or 0.375, got "${text}"`);
  const frac = m[2] ?? '';
  if (frac.length > decimals) throw new RangeError(`${name} has more than ${decimals} decimals`);
  const v = BigInt(m[1]) * pow10(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  if (v > MAX_AMOUNT) throw new RangeError(`${name} is out of range`);
  return v;
}

function formatDecimal(value, decimals) {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const scale = pow10(decimals);
  const whole = abs / scale;
  let frac = decimals > 0 ? (abs % scale).toString().padStart(decimals, '0').replace(/0+$/, '') : '';
  return (neg && abs !== 0n ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}

/** Parse a USD amount such as "0.333" into micro-dollars. At most 6 decimals. */
export function parseUsd(text) {
  return parseDecimal(text, USD_DECIMALS, 'usd');
}

/** Format micro-dollars as a plain decimal without trailing zeros: 333000n -> "0.333". */
export function formatUsd(micros) {
  return formatDecimal(toAmount(micros, 'micros', { allowNegative: true }), USD_DECIMALS);
}

/** Parse a points amount such as "0.375" into integer units of a currency with `decimals` decimals. */
export function parseUnits(text, decimals) {
  toInt(decimals, 'decimals', 0, MAX_DECIMALS);
  return parseDecimal(text, decimals, 'points');
}

/** Format integer units of a currency with `decimals` decimals: 375n, 3 -> "0.375". */
export function formatUnits(units, decimals) {
  toInt(decimals, 'decimals', 0, MAX_DECIMALS);
  return formatDecimal(toAmount(units, 'units', { allowNegative: true }), decimals);
}

/** numerator / denominator for non-negative BigInts, rounded with one of ROUNDING_MODES. */
export function divRound(numerator, denominator, mode = 'floor') {
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint') throw new TypeError('divRound takes bigints');
  if (numerator < 0n || denominator <= 0n) throw new RangeError('divRound needs numerator >= 0 and denominator > 0');
  const q = numerator / denominator;
  const r = numerator % denominator;
  if (r === 0n) return q;
  switch (mode) {
    case 'floor':
      return q;
    case 'ceil':
      return q + 1n;
    case 'half-up':
      return 2n * r >= denominator ? q + 1n : q;
    case 'half-even':
      if (2n * r > denominator) return q + 1n;
      if (2n * r < denominator) return q;
      return q % 2n === 0n ? q : q + 1n;
    default:
      throw new RangeError(`unknown rounding mode "${mode}"`);
  }
}

function parseRate(rate, name) {
  if (typeof rate === 'bigint' || typeof rate === 'number') {
    const v = toAmount(rate, name) * MICRO;
    if (v === 0n || v > MAX_AMOUNT) throw new RangeError(`${name} is out of range`);
    return v;
  }
  const v = parseDecimal(rate, 6, name);
  if (v === 0n) throw new RangeError(`${name} must be greater than 0`);
  return v;
}

/**
 * Validate and freeze a currency definition.
 * rate: points per 1 USD of payout before the user share ("1000", or up to 6 decimals as a string).
 * userShareBps: share of the payout given to users, in basis points (5000 = 50%).
 * decimals: decimals of the currency (0 = whole points).
 * rounding: rounding of earned points, "floor" by default.
 * redemptionRate: points per 1 USD of cash-out value. Defaults to rate.
 */
export function defineCurrency(config) {
  if (config === null || typeof config !== 'object') throw new TypeError('currency config must be an object');
  const { rate, userShareBps, decimals = 0, rounding = 'floor' } = config;
  const redemptionRate = config.redemptionRate ?? rate;
  const rateMicros = parseRate(rate, 'rate');
  const redemptionRateMicros = parseRate(redemptionRate, 'redemptionRate');
  toInt(userShareBps, 'userShareBps', 1, 10_000);
  toInt(decimals, 'decimals', 0, MAX_DECIMALS);
  if (!ROUNDING_MODES.includes(rounding)) throw new RangeError(`unknown rounding mode "${rounding}"`);
  return Object.freeze({
    rate: formatDecimal(rateMicros, 6),
    rateMicros,
    userShareBps,
    decimals,
    rounding,
    redemptionRate: formatDecimal(redemptionRateMicros, 6),
    redemptionRateMicros,
  });
}

function asCurrency(currency) {
  if (currency && typeof currency === 'object' && typeof currency.rateMicros === 'bigint') return currency;
  return defineCurrency(currency);
}

/**
 * Points (integer units) a user earns for a payout:
 * payout x rate x share x (1 + bonus), rounded once with the currency's rounding.
 */
export function pointsForPayout(payoutMicros, currency, { bonusBps = 0 } = {}) {
  const c = asCurrency(currency);
  const payout = toAmount(payoutMicros, 'payoutMicros');
  toInt(bonusBps, 'bonusBps', 0, MAX_BONUS_BPS);
  const num = payout * c.rateMicros * BigInt(c.userShareBps) * (BPS + BigInt(bonusBps)) * pow10(c.decimals);
  const den = MICRO * MICRO * BPS * BPS;
  return checkResult(divRound(num, den, c.rounding), 'points');
}

/** Face value in micro-dollars of `units` points at the redemption rate. Floor by default. */
export function pointsToUsd(units, currency, { rounding = 'floor' } = {}) {
  const c = asCurrency(currency);
  const u = toAmount(units, 'units');
  const num = u * MICRO * MICRO;
  const den = pow10(c.decimals) * c.redemptionRateMicros;
  return checkResult(divRound(num, den, rounding), 'micros');
}

/** Points needed for a USD value at the redemption rate. Ceil by default, so a price is never undercharged. */
export function usdToPoints(micros, currency, { rounding = 'ceil' } = {}) {
  const c = asCurrency(currency);
  const m = toAmount(micros, 'micros');
  const num = m * c.redemptionRateMicros * pow10(c.decimals);
  const den = MICRO * MICRO;
  return checkResult(divRound(num, den, rounding), 'points');
}

/**
 * Points price of a gift card or payout with face value faceMicros, optionally passing a
 * provider fee to the user: a percentage (feeBps) and/or a fixed fee (feeMicros). Always rounded up.
 */
export function giftCardCost(faceMicros, currency, { feeBps = 0, feeMicros = 0 } = {}) {
  const c = asCurrency(currency);
  const face = toAmount(faceMicros, 'faceMicros');
  const fixed = toAmount(feeMicros, 'feeMicros');
  toInt(feeBps, 'feeBps', 0, MAX_BONUS_BPS);
  const totalTimesBps = face * (BPS + BigInt(feeBps)) + fixed * BPS;
  const num = totalTimesBps * c.redemptionRateMicros * pow10(c.decimals);
  const den = MICRO * MICRO * BPS;
  return checkResult(divRound(num, den, 'ceil'), 'points');
}

/**
 * Can a user cash out `cost` points? `minimum` is the smallest cash-out allowed, in points.
 * Returns { ok, reason, shortfall } with reason "ok", "below_minimum" or "insufficient_balance".
 */
export function checkCashout({ balance, cost, minimum = 0 }) {
  const b = toAmount(balance, 'balance', { allowNegative: true });
  const k = toAmount(cost, 'cost');
  const min = toAmount(minimum, 'minimum');
  if (k === 0n || k < min) return { ok: false, reason: 'below_minimum', shortfall: 0n };
  if (b < k) return { ok: false, reason: 'insufficient_balance', shortfall: k - b };
  return { ok: true, reason: 'ok', shortfall: 0n };
}

const PERIODS = { none: 0, daily: 86_400, weekly: 604_800 };

function validateWindow(w, i) {
  if (w === null || typeof w !== 'object') throw new TypeError(`bonus window ${i} must be an object`);
  const repeat = w.repeat ?? 'none';
  if (!(repeat in PERIODS)) throw new RangeError(`bonus window ${i}: repeat must be none, daily or weekly`);
  toInt(w.bonusBps, `bonus window ${i} bonusBps`, 0, MAX_BONUS_BPS);
  const start = w.start ?? null;
  const end = w.end ?? null;
  if (start !== null) toInt(start, `bonus window ${i} start`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (end !== null) toInt(end, `bonus window ${i} end`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (start !== null && end !== null && end <= start) throw new RangeError(`bonus window ${i}: end must be after start`);
  if (repeat !== 'none') {
    if (start === null || end === null) throw new RangeError(`bonus window ${i}: a repeating window needs a start and an end`);
    if (end - start >= PERIODS[repeat]) throw new RangeError(`bonus window ${i}: a ${repeat} window must be shorter than its period`);
  }
  return { bonusBps: w.bonusBps, start, end, repeat };
}

function windowActive(w, t) {
  if (w.repeat === 'none') return (w.start === null || w.start <= t) && (w.end === null || t < w.end);
  if (t < w.start) return false;
  const period = PERIODS[w.repeat];
  return (t - w.start) % period < w.end - w.start;
}

/**
 * The bonus in basis points that applies at Unix time `atSeconds`: the highest active window, or 0.
 * Windows are [start, end) in Unix seconds; null means open. Daily and weekly repeats use fixed
 * 86,400 and 604,800 second periods from `start`.
 */
export function activeBonusBps(windows, atSeconds) {
  if (!Array.isArray(windows)) throw new TypeError('windows must be an array');
  toInt(atSeconds, 'atSeconds', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  let best = 0;
  windows.forEach((raw, i) => {
    const w = validateWindow(raw, i);
    if (windowActive(w, atSeconds) && w.bonusBps > best) best = w.bonusBps;
  });
  return best;
}

/**
 * How many points a reversal may take back: what is left of the credit, or `requested` if smaller.
 * Never more than was credited, across any number of partial reversals.
 */
export function reversalAmount({ credited, alreadyReversed = 0 }, requested) {
  const c = toAmount(credited, 'credited');
  const done = toAmount(alreadyReversed, 'alreadyReversed');
  if (done > c) throw new RangeError('alreadyReversed is larger than credited');
  const left = c - done;
  if (requested === undefined || requested === null) return left;
  const r = toAmount(requested, 'requested');
  return r < left ? r : left;
}

/**
 * Apply a reversal to a balance. With allowNegativeBalance (default) the full reversal is taken and
 * the balance may go below 0. Without it, the balance stops at 0 and the rest is returned as `uncollected`.
 */
export function applyReversal({ balance, credited, alreadyReversed = 0, requested, allowNegativeBalance = true }) {
  const b = toAmount(balance, 'balance', { allowNegative: true });
  const amount = reversalAmount({ credited, alreadyReversed }, requested);
  if (typeof allowNegativeBalance !== 'boolean') throw new TypeError('allowNegativeBalance must be a boolean');
  if (allowNegativeBalance) {
    return { reversed: amount, newBalance: checkResult(b - amount, 'newBalance'), uncollected: 0n };
  }
  const available = b > 0n ? b : 0n;
  const taken = amount < available ? amount : available;
  return { reversed: amount, newBalance: b - taken, uncollected: amount - taken };
}

/**
 * Inflation check for 1,000 whole points.
 * revenuePer1000PointsMicros: payout you earned to mint 1,000 points (at bonusBps).
 * valuePer1000PointsMicros: what users can redeem 1,000 points for, at the redemption rate or at the
 *   price of a specific gift card ({ faceMicros, cost } with cost in point units).
 * effectiveUserShareBps: value / revenue, in basis points. Above 10,000 you pay out more than you earn.
 * exceedsRevenue: exact comparison, no rounding.
 * Displayed amounts are rounded half-up.
 */
export function inflationCheck(currency, { bonusBps = 0, giftCard } = {}) {
  const c = asCurrency(currency);
  toInt(bonusBps, 'bonusBps', 0, MAX_BONUS_BPS);
  const mint = c.rateMicros * BigInt(c.userShareBps) * (BPS + BigInt(bonusBps)); // points per USD x 1e14
  const thousand = 1000n;
  const revenue = divRound(thousand * MICRO * MICRO * BPS * BPS, mint, 'half-up');
  let valueNum;
  let valueDen;
  if (giftCard === undefined || giftCard === null) {
    valueNum = thousand * MICRO * MICRO;
    valueDen = c.redemptionRateMicros;
  } else {
    const face = toAmount(giftCard.faceMicros, 'giftCard.faceMicros');
    const cost = toAmount(giftCard.cost, 'giftCard.cost');
    if (cost === 0n) throw new RangeError('giftCard.cost must be greater than 0');
    valueNum = face * thousand * pow10(c.decimals);
    valueDen = cost;
  }
  const value = divRound(valueNum, valueDen, 'half-up');
  // share = (valueNum / valueDen) / (1e14 * 1e6 / mint) ... in bps
  const shareNum = valueNum * mint * BPS;
  const shareDen = valueDen * thousand * MICRO * MICRO * BPS * BPS;
  return {
    revenuePer1000PointsMicros: checkResult(revenue, 'revenue'),
    valuePer1000PointsMicros: checkResult(value, 'value'),
    effectiveUserShareBps: checkResult(divRound(shareNum, shareDen, 'half-up'), 'share'),
    exceedsRevenue: shareNum > shareDen * BPS,
  };
}

/**
 * Currency preset that follows the Moonetix rewards docs (https://docs.moonetix.com/rewards):
 * reward = payout x conversion rate x split / 100 x (1 + bonus / 100), rounded to whole numbers or
 * to 3 decimals, halves rounded up. splitPercent is a whole number from 1 to 100.
 */
export function moonetixCurrency({ rate, splitPercent, rounding = 'whole' }) {
  toInt(splitPercent, 'splitPercent', 1, 100);
  if (rounding !== 'whole' && rounding !== 'three-decimals') throw new RangeError('rounding must be "whole" or "three-decimals"');
  return defineCurrency({
    rate,
    userShareBps: splitPercent * 100,
    decimals: rounding === 'whole' ? 0 : 3,
    rounding: 'half-up',
  });
}

/** Bonus percent of the Moonetix Rewards settings (0 to 500, up to 2 decimals) as basis points. */
export function moonetixBonusBps(percent) {
  const text = typeof percent === 'number' && Number.isSafeInteger(percent) ? String(percent) : percent;
  const v = parseDecimal(text, 2, 'percent');
  if (v > 50_000n) throw new RangeError('a Moonetix bonus is at most 500 percent');
  return Number(v);
}
