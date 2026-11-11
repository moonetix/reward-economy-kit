/** An integer amount. Numbers must be safe integers; results are always bigint. */
export type Amount = bigint | number;

export type RoundingMode = 'floor' | 'ceil' | 'half-up' | 'half-even';

export interface CurrencyConfig {
  /** Points per 1 USD of payout before the user share, e.g. "1000" or "0.5" (up to 6 decimals). */
  rate: string | Amount;
  /** Share of the payout given to users, in basis points: 5000 = 50%. 1 to 10000. */
  userShareBps: number;
  /** Decimals of the currency. 0 = whole points. 0 to 6. Default 0. */
  decimals?: number;
  /** Rounding of earned points. Default "floor". */
  rounding?: RoundingMode;
  /** Points per 1 USD of cash-out value. Defaults to rate. */
  redemptionRate?: string | Amount;
}

export interface Currency {
  readonly rate: string;
  readonly rateMicros: bigint;
  readonly userShareBps: number;
  readonly decimals: number;
  readonly rounding: RoundingMode;
  readonly redemptionRate: string;
  readonly redemptionRateMicros: bigint;
}

export interface BonusWindow {
  bonusBps: number;
  /** Unix seconds, inclusive. null = open. */
  start?: number | null;
  /** Unix seconds, exclusive. null = open. */
  end?: number | null;
  repeat?: 'none' | 'daily' | 'weekly';
}

export interface CashoutCheck {
  ok: boolean;
  reason: 'ok' | 'below_minimum' | 'insufficient_balance';
  shortfall: bigint;
}

export interface ReversalResult {
  reversed: bigint;
  newBalance: bigint;
  uncollected: bigint;
}

export interface InflationReport {
  revenuePer1000PointsMicros: bigint;
  valuePer1000PointsMicros: bigint;
  effectiveUserShareBps: bigint;
  exceedsRevenue: boolean;
}

export declare const USD_DECIMALS: 6;
export declare const MAX_AMOUNT: bigint;
export declare const MAX_DECIMALS: 6;
export declare const MAX_BONUS_BPS: number;
export declare const ROUNDING_MODES: readonly RoundingMode[];

export declare function parseUsd(text: string): bigint;
export declare function formatUsd(micros: Amount): string;
export declare function parseUnits(text: string, decimals: number): bigint;
export declare function formatUnits(units: Amount, decimals: number): string;
export declare function divRound(numerator: bigint, denominator: bigint, mode?: RoundingMode): bigint;
export declare function defineCurrency(config: CurrencyConfig): Currency;

export declare function pointsForPayout(payoutMicros: Amount, currency: Currency | CurrencyConfig, options?: { bonusBps?: number }): bigint;
export declare function pointsToUsd(units: Amount, currency: Currency | CurrencyConfig, options?: { rounding?: RoundingMode }): bigint;
export declare function usdToPoints(micros: Amount, currency: Currency | CurrencyConfig, options?: { rounding?: RoundingMode }): bigint;
export declare function giftCardCost(faceMicros: Amount, currency: Currency | CurrencyConfig, options?: { feeBps?: number; feeMicros?: Amount }): bigint;
export declare function checkCashout(input: { balance: Amount; cost: Amount; minimum?: Amount }): CashoutCheck;

export declare function activeBonusBps(windows: readonly BonusWindow[], atSeconds: number): number;

export declare function reversalAmount(credit: { credited: Amount; alreadyReversed?: Amount }, requested?: Amount | null): bigint;
export declare function applyReversal(input: {
  balance: Amount;
  credited: Amount;
  alreadyReversed?: Amount;
  requested?: Amount | null;
  allowNegativeBalance?: boolean;
}): ReversalResult;

export declare function inflationCheck(
  currency: Currency | CurrencyConfig,
  options?: { bonusBps?: number; giftCard?: { faceMicros: Amount; cost: Amount } | null },
): InflationReport;

export declare function moonetixCurrency(preset: { rate: string | Amount; splitPercent: number; rounding?: 'whole' | 'three-decimals' }): Currency;
export declare function moonetixBonusBps(percent: string | number): number;
