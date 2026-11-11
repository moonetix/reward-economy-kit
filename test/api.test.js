import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyReversal,
  defineCurrency,
  giftCardCost,
  inflationCheck,
  moonetixBonusBps,
  moonetixCurrency,
  parseUsd,
  pointsForPayout,
  reversalAmount,
} from '../src/index.js';

test('safe integer numbers are accepted, fractional numbers are not', () => {
  const c = defineCurrency({ rate: 1000, userShareBps: 5000 });
  assert.equal(pointsForPayout(500_000, c), 250n);
  assert.throws(() => pointsForPayout(0.5, c), TypeError);
  assert.throws(() => pointsForPayout(Number.MAX_SAFE_INTEGER + 1, c), TypeError);
});

test('a defined currency is frozen', () => {
  const c = defineCurrency({ rate: '1000', userShareBps: 5000 });
  assert.ok(Object.isFrozen(c));
});

test('a credit and its partial reversals never take back more than was credited', () => {
  const c = defineCurrency({ rate: '1000', userShareBps: 6000 });
  const credited = pointsForPayout(parseUsd('1.25'), c, { bonusBps: 2000 }); // 1.25 x 1000 x 0.6 x 1.2 = 900
  assert.equal(credited, 900n);

  let balance = 900n;
  let reversed = 0n;
  for (const requested of [300n, 300n, 300n, 300n]) {
    const r = applyReversal({ balance, credited, alreadyReversed: reversed, requested });
    balance = r.newBalance;
    reversed += r.reversed;
  }
  assert.equal(reversed, credited);
  assert.equal(balance, 0n);
  assert.equal(reversalAmount({ credited, alreadyReversed: reversed }), 0n);
});

test('the reversal uses the stored credit, not a recalculation under new settings', () => {
  const before = defineCurrency({ rate: '1000', userShareBps: 5000 });
  const credited = pointsForPayout(parseUsd('2'), before, { bonusBps: 5000 }); // 1500 with a 50% bonus
  const r = applyReversal({ balance: 1500n, credited });
  assert.equal(r.reversed, 1500n);
});

test('floor never pays users more than their share, summed over many small payouts', () => {
  const c = defineCurrency({ rate: '100', userShareBps: 7000 });
  let paid = 0n;
  let payoutTotal = 0n;
  for (let micros = 1_000n; micros <= 50_000n; micros += 997n) {
    paid += pointsForPayout(micros, c);
    payoutTotal += micros;
  }
  // Exact user share of the total, in points: payout x 100 x 0.7.
  const exactShareTimes1e6 = payoutTotal * 70n;
  assert.ok(paid * 1_000_000n <= exactShareTimes1e6);
});

test('passing a gift card fee on keeps the effective share at or below the configured share', () => {
  const c = defineCurrency({ rate: '1000', userShareBps: 5000 });
  const cost = giftCardCost(parseUsd('10'), c, { feeBps: 250 });
  assert.equal(cost, 10_250n);
  const report = inflationCheck(c, { giftCard: { faceMicros: parseUsd('10'), cost } });
  assert.equal(report.exceedsRevenue, false);
  assert.ok(report.effectiveUserShareBps <= 5000n);
});

test('Moonetix preset reproduces the rewards docs table', () => {
  const rows = [
    { payout: '0.50', rate: '1000', split: 50, bonus: null, rounding: 'whole', reward: 250n },
    { payout: '0.50', rate: '1000', split: 50, bonus: '10', rounding: 'whole', reward: 275n },
    { payout: '0.333', rate: '100', split: 50, bonus: null, rounding: 'whole', reward: 17n },
    { payout: '0.75', rate: '1', split: 50, bonus: null, rounding: 'three-decimals', reward: 375n },
  ];
  for (const row of rows) {
    const currency = moonetixCurrency({ rate: row.rate, splitPercent: row.split, rounding: row.rounding });
    const bonusBps = row.bonus === null ? 0 : moonetixBonusBps(row.bonus);
    assert.equal(pointsForPayout(parseUsd(row.payout), currency, { bonusBps }), row.reward, `payout ${row.payout}`);
  }
});

test('Moonetix steps are rounded one by one', () => {
  const c = moonetixCurrency({ rate: '100', splitPercent: 50 });
  const steps = pointsForPayout(parseUsd('0.333'), c) + pointsForPayout(parseUsd('0.333'), c);
  const whole = pointsForPayout(parseUsd('0.666'), c);
  assert.equal(steps, 34n);
  assert.equal(whole, 33n);
});
