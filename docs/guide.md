# Designing a rewards currency

This guide covers the numbers behind a points currency for an offerwall, a rewards site or an in-app economy: how many points a dollar of revenue buys, how much of that revenue goes to users, how rounding and bonuses move the result, and how to check that what users can redeem never exceeds what you earned. Every example can be reproduced with the functions in this repository.

Amounts in code are integers: USD in micro-units (`$0.50` is `500000n`) and points in the currency's smallest unit. That is the whole reason this kit exists. `0.1 + 0.2` is not `0.3` in floating point, and a ledger that is off by a fraction of a point per credit drifts by thousands of points across a large user base.

## The three settings

| Setting | Meaning | Example |
| --- | --- | --- |
| Rate | Points per $1 of payout, before the user share | 1000 |
| User share | Part of the payout that goes to users as points | 50% (`userShareBps: 5000`) |
| Rounding | How a fractional result becomes a whole unit | floor |

```
points = payout x rate x share x (1 + bonus), rounded once
```

A $0.50 offer at rate 1000 and a 50% share is worth 250 points. If you redeem points at face value, 1,000 points buy $1 of gift cards, so the user received $0.25 of value for your $0.50 of revenue: exactly the 50% share.

Keep these two ideas apart:

- **Rate** sets the size of the numbers users see. It does not change your margin on its own.
- **Share** sets your margin. It is the number to reason about in dollars.

Moonetix uses the same three settings in the Rewards section of each offerwall. See [Rewards and currency](https://docs.moonetix.com/rewards) for the formula, rounding rules and how the reward reaches your postback.

## Picking a rate

Pick the rate from the smallest payout you expect, not the largest.

Each credit loses up to one unit to rounding (floor) or moves by up to half a unit (half-up). As a fraction of the reward, that error shrinks as the reward grows. With the smallest step paying `p_min` dollars, a rate `r` and a share `s`, the smallest reward is `p_min x r x s` units.

**Worked example.** The smallest steps on your wall pay $0.02 and the user share is 50%.

| Rate | Reward for $0.02 | Floor result | Lost to rounding |
| --- | --- | --- | --- |
| 10 | 0.1 | 0 | The offer pays nothing and should be hidden |
| 100 | 1 | 1 | 0% |
| 100, payout $0.019 | 0.95 | 0 | 100% |
| 1000, payout $0.019 | 9.5 | 9 | 5.3% |
| 10000, payout $0.019 | 95 | 95 | 0% |

```js
import { defineCurrency, pointsForPayout, parseUsd } from '@moonetix/reward-economy-kit';

const coins = defineCurrency({ rate: '1000', userShareBps: 5000 });
pointsForPayout(parseUsd('0.019'), coins); // 9n
```

A practical rule: make the smallest expected reward at least 100 units, which keeps the floor loss under 1% per credit. If that makes the numbers too large for your audience, add decimals instead (`decimals: 2` or `3`) and show them.

Some publishers pay users in dollars: rate 1, a share, and 3 decimals. `$0.75` at a 50% share is `0.375`.

Try settings in the [Virtual Currency Calculator](https://moonetix.com/tools/virtual-currency-calculator) before you commit to them. The [exchange rate guide](https://moonetix.com/academy/monetization/virtual-currency-exchange-rate) walks through five complete setups.

## Picking a share

The share is what remains after you price in every cost a credited point carries until it is redeemed or expires:

- **Cash-out cost.** Gift card and payout providers charge per order, as a percentage, a fixed fee or a currency conversion spread.
- **Reversals you cannot collect.** A network can reverse a conversion after the user has already cashed out. You pay that out of margin.
- **Fraud.** Multi-accounting, VPNs and device farms that slip past your checks.
- **Support and operations.** Missing reward tickets, KYC, hosting.

**Worked example.** Assume, for illustration only, that per $1.00 of payout you expect $0.03 of cash-out fees on the user's part, $0.04 of reversals you cannot collect, and you want $0.25 left for operations and profit.

```
share = 1.00 - 0.25 (operations and profit) - 0.04 (uncollectable reversals) - 0.03 (fees) = 0.68
```

A 68% share in this example, before any bonus. Your own figures will differ. Measure them from your ledger and revisit the share every quarter. The [Rewards Site Profit Calculator](https://moonetix.com/tools/rewards-site-profit-calculator) runs the same arithmetic over a month of traffic, and the [Offerwall Earnings Calculator](https://moonetix.com/tools/offerwall-earnings-calculator) estimates the revenue side.

If you pass the provider fee on to users instead, price it into the cash-out, not into the share:

```js
giftCardCost(parseUsd('10'), coins, { feeBps: 250 }); // 10250n points for a $10 card at rate 1000
```

## Rounding

`floor` is the default here, for three reasons:

1. **It never pays more than the share.** Summed over any number of credits, users receive at most `share` of the revenue.
2. **It cannot be farmed.** With `ceil` or `half-up`, a step worth 0.5 units pays 1. Anyone who can trigger many tiny credits collects the difference.
3. **It is cheap to audit.** The total paid is at most the exact total, so a ledger check is one comparison.

The cost of floor is a small, systematic underpayment: on average half a unit per credit. With a well-chosen rate, that is a fraction of a cent.

`half-up` is the common display convention and what Moonetix uses for the reward in postbacks ("Halves round up"). `half-even` removes the half-up bias across many credits. `ceil` is for prices: what a user pays for a gift card is rounded up so you never sell value below cost. That is why `usdToPoints` and `giftCardCost` round up by default.

Round once, at the end. Rounding an intermediate value (for example, rounding `payout x rate` and then applying the share) changes results. When an offer has several steps, each step is a separate credit and is rounded on its own, so the sum of the steps can differ from rounding the total:

```js
const c = moonetixCurrency({ rate: '100', splitPercent: 50 });
pointsForPayout(parseUsd('0.333'), c) * 2n; // 34n, two steps of 17
pointsForPayout(parseUsd('0.666'), c);      // 33n, one credit of 33.3
```

## Bonuses

A bonus multiplies the reward for credits that happen while it runs. It is paid from your share: your revenue does not change, users get more points for it.

```js
import { activeBonusBps } from '@moonetix/reward-economy-kit';

const windows = [
  // Every day from 18:00 to 20:00 UTC, starting 2026-01-01.
  { bonusBps: 2000, start: 1767290400, end: 1767297600, repeat: 'daily' },
];
const bonusBps = activeBonusBps(windows, Math.floor(Date.now() / 1000));
pointsForPayout(payoutMicros, coins, { bonusBps });
```

- Evaluate the bonus at the time of the credit, not when the user started the offer.
- Windows are `[start, end)` in Unix seconds. Daily and weekly repeats use fixed 24 hour and 7 day periods, so a repeat that must follow local wall-clock time across daylight saving changes should be expanded with your time zone library and passed as one-off windows.
- When several windows are active, the highest applies. Bonuses do not stack.
- A bonus of `b` raises the effective share to `share x (1 + b)`. At a 50% share, a 100% bonus pays out the entire payout. Run the inflation check below for every bonus you plan.

## Reversals

A reversal takes back a credit. Take back exactly what was credited, stored with the transaction, never a value recalculated from today's settings or today's bonus.

```js
applyReversal({ balance: 100n, credited: 250n });
// { reversed: 250n, newBalance: -150n, uncollected: 0n }

applyReversal({ balance: 100n, credited: 250n, allowNegativeBalance: false });
// { reversed: 250n, newBalance: 0n, uncollected: 150n }
```

- `reversalAmount` caps every reversal, including several partial ones, at the remaining credited amount. A repeated or inflated reversal message cannot take more.
- A negative balance keeps the books exact and blocks the next cash-out until the user earns it back. Stopping at zero is friendlier, but the `uncollected` part is a loss you should record.
- Hold rewards for a while before they can be cashed out. Most reversals arrive in the first weeks, and a hold turns them from losses into balance corrections. See [Reward hold periods](https://moonetix.com/academy/monetization/reward-hold-periods) and [Credits and reversals](https://docs.moonetix.com/credits-and-reversals).

## Cash-out and the minimum

Set the minimum cash-out in dollars, then convert it, rounding up:

```js
const minimum = usdToPoints(parseUsd('5'), coins); // 5000n
checkCashout({ balance: 4999n, cost: 5000n, minimum });
// { ok: false, reason: 'insufficient_balance', shortfall: 1n }
```

The minimum should cover the fixed part of your cash-out cost several times over, and it should be reachable by an honest user in a reasonable number of sessions. A minimum nobody reaches is a common reason users stop returning.

## The inflation check

The question to ask of any currency change is simple: what is 1,000 points worth to the user, and what did it cost you to create them?

```js
inflationCheck(coins);
// revenuePer1000PointsMicros: 2000000n   ($2.00 of payout created 1,000 points)
// valuePer1000PointsMicros:   1000000n   (1,000 points redeem for $1.00)
// effectiveUserShareBps:      5000n      (50%)
// exceedsRevenue:             false
```

Run it for every bonus, gift card price and redemption rate you plan:

| Scenario | Value of 1,000 points | Payout behind them | Effective share |
| --- | --- | --- | --- |
| Rate 1000, share 50%, face value | $1.00 | $2.00 | 50% |
| Same, 100% bonus running | $1.00 | $1.00 | 100% |
| Same, 150% bonus running | $1.00 | $0.80 | 125%, exceeds revenue |
| Rate 1000, share 50%, $5 card for 5,500 points | $0.909 | $2.00 | 45.45% |
| Rate 100, share 90%, redeemed at 80 points per $1 | $12.50 | $11.11 | 112.5%, exceeds revenue |

The last row is the classic mistake: the earning side uses one rate and the shop uses a cheaper one. Points are worth more on the way out than they cost on the way in, and the gap grows with every redemption.

When you change the rate later, decide what happens to existing balances. Either keep the redemption rate unchanged (existing points keep their value, new points are minted at the new rate), or convert every balance by the ratio of the old and new redemption rates in one migration. Do not change only the shop price.

For more on sources, sinks and inflation signals, see [Virtual economy design](https://moonetix.com/academy/monetization/virtual-economy-design).

## Matching Moonetix rewards

If your offerwall is on Moonetix, the reward in every postback is already in your currency, calculated and rounded by Moonetix and stored with the transaction. Credit `{reward}` exactly as received, and on a reversal (status 2) take back what you credited for that `{transaction_id}`. See [Postbacks](https://docs.moonetix.com/postbacks).

The preset is useful for previews, tests, and your own offer lists built from the [Offers API](https://docs.moonetix.com/offers-api):

```js
import { moonetixCurrency, moonetixBonusBps, pointsForPayout, parseUsd, formatUnits } from '@moonetix/reward-economy-kit';

const c = moonetixCurrency({ rate: '1000', splitPercent: 50, rounding: 'whole' });
pointsForPayout(parseUsd('0.50'), c, { bonusBps: moonetixBonusBps('10') }); // 275n
```

The preset follows the documented formula `payout x conversion rate x split / 100 x (1 + bonus / 100)`, with whole numbers or 3 decimals and halves rounded up. The tests reproduce every example in the docs: 250, 275, 17 (16.65 rounded), 0.375, 0.008 (0.0084 rounded) and 3 (2.5 rounded). The kit uses exact decimal arithmetic. If a value ever sits exactly on a rounding boundary and differs by one unit from a postback, the postback is the record.
