import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as kit from '../src/index.js';

const vectors = JSON.parse(readFileSync(new URL('../test-vectors/vectors.json', import.meta.url), 'utf8'));

const big = (v) => (v === undefined ? undefined : BigInt(v));
const toStrings = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]));

const runners = {
  parseUsd: (c) => kit.parseUsd(c.in).toString(),
  formatUsd: (c) => kit.formatUsd(BigInt(c.in)),
  parseUnits: (c) => kit.parseUnits(c.in, c.decimals).toString(),
  formatUnits: (c) => kit.formatUnits(BigInt(c.in), c.decimals),
  divRound: (c) => kit.divRound(BigInt(c.n), BigInt(c.d), c.mode).toString(),
  defineCurrency: (c) => toStrings(kit.defineCurrency(c.config)),
  pointsForPayout: (c) => kit.pointsForPayout(BigInt(c.payout), c.currency, { bonusBps: c.bonusBps ?? 0 }).toString(),
  pointsToUsd: (c) => kit.pointsToUsd(BigInt(c.units), c.currency, { rounding: c.rounding ?? 'floor' }).toString(),
  usdToPoints: (c) => kit.usdToPoints(BigInt(c.micros), c.currency, { rounding: c.rounding ?? 'ceil' }).toString(),
  giftCardCost: (c) => kit.giftCardCost(BigInt(c.face), c.currency, { feeBps: c.feeBps ?? 0, feeMicros: big(c.feeMicros) ?? 0n }).toString(),
  checkCashout: (c) => toStrings(kit.checkCashout({ balance: BigInt(c.balance), cost: BigInt(c.cost), minimum: big(c.minimum) ?? 0n })),
  activeBonusBps: (c) => kit.activeBonusBps(c.windows, c.at),
  reversalAmount: (c) => kit.reversalAmount({ credited: BigInt(c.credited), alreadyReversed: big(c.alreadyReversed) ?? 0n }, big(c.requested)).toString(),
  applyReversal: (c) =>
    toStrings(
      kit.applyReversal({
        balance: BigInt(c.balance),
        credited: BigInt(c.credited),
        alreadyReversed: big(c.alreadyReversed) ?? 0n,
        requested: big(c.requested),
        allowNegativeBalance: c.allowNegativeBalance ?? true,
      }),
    ),
  inflationCheck: (c) =>
    toStrings(
      kit.inflationCheck(c.currency, {
        bonusBps: c.bonusBps ?? 0,
        giftCard: c.giftCard ? { faceMicros: BigInt(c.giftCard.faceMicros), cost: BigInt(c.giftCard.cost) } : undefined,
      }),
    ),
  moonetixCurrency: (c) => {
    const currency = kit.moonetixCurrency(c.preset);
    const bonusBps = c.bonusPercent === undefined ? 0 : kit.moonetixBonusBps(c.bonusPercent);
    const units = kit.pointsForPayout(kit.parseUsd(c.payout), currency, { bonusBps });
    assert.equal(kit.formatUnits(units, currency.decimals), c.text, 'formatted reward');
    return units.toString();
  },
  moonetixBonusBps: (c) => kit.moonetixBonusBps(c.in),
};

for (const [group, run] of Object.entries(runners)) {
  const cases = vectors[group];
  test(`vectors: ${group}`, () => {
    assert.ok(Array.isArray(cases) && cases.length > 0, `no vectors for ${group}`);
    cases.forEach((c, i) => {
      const label = `${group}[${i}]${c.name ? ` ${c.name}` : ''}`;
      if (c.throws) {
        assert.throws(() => run(c), (err) => err instanceof RangeError || err instanceof TypeError, label);
      } else {
        assert.deepEqual(run(c), c.out, label);
      }
    });
  });
}

test('every vector group has a runner', () => {
  const groups = Object.keys(vectors).filter((k) => Array.isArray(vectors[k]));
  assert.deepEqual(groups.sort(), Object.keys(runners).sort());
});
