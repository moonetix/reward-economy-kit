<?php

declare(strict_types=1);

namespace Moonetix\RewardEconomy;

/**
 * Integer-only math for a rewards currency. Same behavior as the JavaScript build;
 * both run test-vectors/vectors.json.
 *
 * Money is in USD micro-units (1 USD = 1,000,000). Points are integer units of the
 * currency's smallest step (with 3 decimals, 0.375 points is 375 units).
 */
final class RewardEconomy
{
    public const USD_DECIMALS = 6;
    public const MAX_AMOUNT = PHP_INT_MAX;
    public const MAX_DECIMALS = 6;
    public const MAX_BONUS_BPS = 1_000_000;
    public const ROUNDING_MODES = ['floor', 'ceil', 'half-up', 'half-even'];

    private const BPS = '10000';
    private const MICRO = '1000000';
    private const PERIODS = ['none' => 0, 'daily' => 86_400, 'weekly' => 604_800];

    public static function parseUsd(string $text): int
    {
        return self::parseDecimal($text, self::USD_DECIMALS, 'usd');
    }

    public static function formatUsd(int $micros): string
    {
        return self::formatDecimal(self::amount($micros, 'micros', true), self::USD_DECIMALS);
    }

    public static function parseUnits(string $text, int $decimals): int
    {
        self::int($decimals, 'decimals', 0, self::MAX_DECIMALS);
        return self::parseDecimal($text, $decimals, 'points');
    }

    public static function formatUnits(int $units, int $decimals): string
    {
        self::int($decimals, 'decimals', 0, self::MAX_DECIMALS);
        return self::formatDecimal(self::amount($units, 'units', true), $decimals);
    }

    /** $numerator / $denominator as non-negative decimal strings, rounded with one of ROUNDING_MODES. */
    public static function divRound(string $numerator, string $denominator, string $mode = 'floor'): string
    {
        if (!preg_match('/^\d+$/', $numerator) || !preg_match('/^\d+$/', $denominator)) {
            throw new \InvalidArgumentException('divRound takes non-negative integer strings');
        }
        $n = ltrim($numerator, '0') ?: '0';
        $d = ltrim($denominator, '0') ?: '0';
        if ($d === '0') {
            throw new \InvalidArgumentException('divRound needs denominator > 0');
        }
        if (!in_array($mode, self::ROUNDING_MODES, true)) {
            throw new \InvalidArgumentException('unknown rounding mode "' . $mode . '"');
        }
        [$q, $r] = BigNat::divmod($n, $d);
        if ($r === '0' || $mode === 'floor') {
            return $q;
        }
        $up = BigNat::add($q, '1');
        $twice = BigNat::add($r, $r);
        $c = BigNat::cmp($twice, $d);
        return match ($mode) {
            'ceil' => $up,
            'half-up' => $c >= 0 ? $up : $q,
            'half-even' => $c > 0 ? $up : ($c < 0 ? $q : ((int)substr($q, -1) % 2 === 0 ? $q : $up)),
        };
    }

    /**
     * @param array{rate: string|int, userShareBps: int, decimals?: int, rounding?: string, redemptionRate?: string|int|null} $config
     */
    public static function defineCurrency(array $config): Currency
    {
        if (!array_key_exists('rate', $config) || !array_key_exists('userShareBps', $config)) {
            throw new \InvalidArgumentException('currency config needs rate and userShareBps');
        }
        $rate = $config['rate'];
        $redemption = $config['redemptionRate'] ?? $rate;
        $rateMicros = self::parseRate($rate, 'rate');
        $redemptionMicros = self::parseRate($redemption, 'redemptionRate');
        $share = self::int($config['userShareBps'], 'userShareBps', 1, 10_000);
        $decimals = self::int($config['decimals'] ?? 0, 'decimals', 0, self::MAX_DECIMALS);
        $rounding = $config['rounding'] ?? 'floor';
        if (!in_array($rounding, self::ROUNDING_MODES, true)) {
            throw new \InvalidArgumentException('unknown rounding mode "' . (is_string($rounding) ? $rounding : gettype($rounding)) . '"');
        }
        return new Currency(
            self::formatDecimal($rateMicros, 6),
            $rateMicros,
            $share,
            $decimals,
            $rounding,
            self::formatDecimal($redemptionMicros, 6),
            $redemptionMicros,
        );
    }

    /** Points a user earns for a payout: payout x rate x share x (1 + bonus), rounded once. */
    public static function pointsForPayout(int $payoutMicros, Currency|array $currency, int $bonusBps = 0): int
    {
        $c = self::currency($currency);
        $payout = self::amount($payoutMicros, 'payoutMicros');
        self::int($bonusBps, 'bonusBps', 0, self::MAX_BONUS_BPS);
        $num = BigNat::mul((string)$payout, (string)$c->rateMicros, (string)$c->userShareBps, (string)(10_000 + $bonusBps), BigNat::pow10($c->decimals));
        $den = BigNat::pow10(20);
        return BigNat::toInt(self::divRound($num, $den, $c->rounding), 'points');
    }

    /** Face value in micro-dollars of $units points at the redemption rate. */
    public static function pointsToUsd(int $units, Currency|array $currency, string $rounding = 'floor'): int
    {
        $c = self::currency($currency);
        $u = self::amount($units, 'units');
        $num = BigNat::mul((string)$u, BigNat::pow10(12));
        $den = BigNat::mul(BigNat::pow10($c->decimals), (string)$c->redemptionRateMicros);
        return BigNat::toInt(self::divRound($num, $den, $rounding), 'micros');
    }

    /** Points needed for a USD value at the redemption rate. Rounded up by default. */
    public static function usdToPoints(int $micros, Currency|array $currency, string $rounding = 'ceil'): int
    {
        $c = self::currency($currency);
        $m = self::amount($micros, 'micros');
        $num = BigNat::mul((string)$m, (string)$c->redemptionRateMicros, BigNat::pow10($c->decimals));
        return BigNat::toInt(self::divRound($num, BigNat::pow10(12), $rounding), 'points');
    }

    /** Points price of a gift card with face value $faceMicros, optionally passing a provider fee on. Always rounded up. */
    public static function giftCardCost(int $faceMicros, Currency|array $currency, int $feeBps = 0, int $feeMicros = 0): int
    {
        $c = self::currency($currency);
        $face = self::amount($faceMicros, 'faceMicros');
        $fixed = self::amount($feeMicros, 'feeMicros');
        self::int($feeBps, 'feeBps', 0, self::MAX_BONUS_BPS);
        $total = BigNat::add(BigNat::mul((string)$face, (string)(10_000 + $feeBps)), BigNat::mul((string)$fixed, self::BPS));
        $num = BigNat::mul($total, (string)$c->redemptionRateMicros, BigNat::pow10($c->decimals));
        return BigNat::toInt(self::divRound($num, BigNat::pow10(16), 'ceil'), 'points');
    }

    /** @return array{ok: bool, reason: string, shortfall: int} */
    public static function checkCashout(int $balance, int $cost, int $minimum = 0): array
    {
        $b = self::amount($balance, 'balance', true);
        $k = self::amount($cost, 'cost');
        $min = self::amount($minimum, 'minimum');
        if ($k === 0 || $k < $min) {
            return ['ok' => false, 'reason' => 'below_minimum', 'shortfall' => 0];
        }
        if ($b < $k) {
            return ['ok' => false, 'reason' => 'insufficient_balance', 'shortfall' => $k - $b];
        }
        return ['ok' => true, 'reason' => 'ok', 'shortfall' => 0];
    }

    /**
     * The bonus in basis points at Unix time $atSeconds: the highest active window, or 0.
     *
     * @param list<array{bonusBps: int, start?: ?int, end?: ?int, repeat?: string}> $windows
     */
    public static function activeBonusBps(array $windows, int $atSeconds): int
    {
        $best = 0;
        foreach (array_values($windows) as $i => $raw) {
            $w = self::window($raw, $i);
            if (self::windowActive($w, $atSeconds) && $w['bonusBps'] > $best) {
                $best = $w['bonusBps'];
            }
        }
        return $best;
    }

    /** Points a reversal may take back: what is left of the credit, or $requested if smaller. */
    public static function reversalAmount(int $credited, int $alreadyReversed = 0, ?int $requested = null): int
    {
        $c = self::amount($credited, 'credited');
        $done = self::amount($alreadyReversed, 'alreadyReversed');
        if ($done > $c) {
            throw new \InvalidArgumentException('alreadyReversed is larger than credited');
        }
        $left = $c - $done;
        if ($requested === null) {
            return $left;
        }
        return min(self::amount($requested, 'requested'), $left);
    }

    /** @return array{reversed: int, newBalance: int, uncollected: int} */
    public static function applyReversal(int $balance, int $credited, int $alreadyReversed = 0, ?int $requested = null, bool $allowNegativeBalance = true): array
    {
        $b = self::amount($balance, 'balance', true);
        $amount = self::reversalAmount($credited, $alreadyReversed, $requested);
        if ($allowNegativeBalance) {
            if ($b < -PHP_INT_MAX + $amount) {
                throw new \RangeException('newBalance exceeds MAX_AMOUNT');
            }
            return ['reversed' => $amount, 'newBalance' => $b - $amount, 'uncollected' => 0];
        }
        $taken = min($amount, max($b, 0));
        return ['reversed' => $amount, 'newBalance' => $b - $taken, 'uncollected' => $amount - $taken];
    }

    /**
     * Inflation check for 1,000 whole points. See the JavaScript docs for field meanings.
     *
     * @param array{faceMicros: int, cost: int}|null $giftCard
     * @return array{revenuePer1000PointsMicros: int, valuePer1000PointsMicros: int, effectiveUserShareBps: int, exceedsRevenue: bool}
     */
    public static function inflationCheck(Currency|array $currency, int $bonusBps = 0, ?array $giftCard = null): array
    {
        $c = self::currency($currency);
        self::int($bonusBps, 'bonusBps', 0, self::MAX_BONUS_BPS);
        $mint = BigNat::mul((string)$c->rateMicros, (string)$c->userShareBps, (string)(10_000 + $bonusBps));
        $revenue = self::divRound(BigNat::mul('1000', BigNat::pow10(20)), $mint, 'half-up');
        if ($giftCard === null) {
            $valueNum = BigNat::mul('1000', BigNat::pow10(12));
            $valueDen = (string)$c->redemptionRateMicros;
        } else {
            $face = self::amount($giftCard['faceMicros'] ?? -1, 'giftCard.faceMicros');
            $cost = self::amount($giftCard['cost'] ?? -1, 'giftCard.cost');
            if ($cost === 0) {
                throw new \InvalidArgumentException('giftCard.cost must be greater than 0');
            }
            $valueNum = BigNat::mul((string)$face, '1000', BigNat::pow10($c->decimals));
            $valueDen = (string)$cost;
        }
        $value = self::divRound($valueNum, $valueDen, 'half-up');
        $shareNum = BigNat::mul($valueNum, $mint, self::BPS);
        $shareDen = BigNat::mul($valueDen, '1000', BigNat::pow10(20));
        return [
            'revenuePer1000PointsMicros' => BigNat::toInt($revenue, 'revenue'),
            'valuePer1000PointsMicros' => BigNat::toInt($value, 'value'),
            'effectiveUserShareBps' => BigNat::toInt(self::divRound($shareNum, $shareDen, 'half-up'), 'share'),
            'exceedsRevenue' => BigNat::cmp($shareNum, BigNat::mul($shareDen, self::BPS)) > 0,
        ];
    }

    /**
     * Preset that follows https://docs.moonetix.com/rewards: payout x conversion rate x split / 100
     * x (1 + bonus / 100), whole numbers or 3 decimals, halves rounded up.
     */
    public static function moonetixCurrency(string|int $rate, int $splitPercent, string $rounding = 'whole'): Currency
    {
        self::int($splitPercent, 'splitPercent', 1, 100);
        if ($rounding !== 'whole' && $rounding !== 'three-decimals') {
            throw new \InvalidArgumentException('rounding must be "whole" or "three-decimals"');
        }
        return self::defineCurrency([
            'rate' => $rate,
            'userShareBps' => $splitPercent * 100,
            'decimals' => $rounding === 'whole' ? 0 : 3,
            'rounding' => 'half-up',
        ]);
    }

    /** Bonus percent of the Moonetix Rewards settings (0 to 500, up to 2 decimals) as basis points. */
    public static function moonetixBonusBps(string|int $percent): int
    {
        $v = self::parseDecimal((string)$percent, 2, 'percent');
        if ($v > 50_000) {
            throw new \InvalidArgumentException('a Moonetix bonus is at most 500 percent');
        }
        return $v;
    }

    private static function currency(Currency|array $c): Currency
    {
        return $c instanceof Currency ? $c : self::defineCurrency($c);
    }

    private static function parseRate(mixed $rate, string $name): int
    {
        if (is_int($rate)) {
            $v = BigNat::toInt(BigNat::mul(BigNat::of(self::amount($rate, $name)), self::MICRO), $name);
        } elseif (is_string($rate)) {
            $v = self::parseDecimal($rate, 6, $name);
        } else {
            throw new \InvalidArgumentException($name . ' must be a string or an int');
        }
        if ($v === 0) {
            throw new \InvalidArgumentException($name . ' must be greater than 0');
        }
        return $v;
    }

    private static function parseDecimal(string $text, int $decimals, string $name): int
    {
        if (!preg_match('/^(\d+)(?:\.(\d+))?$/D', $text, $m)) {
            throw new \InvalidArgumentException($name . ' must be a plain decimal like 12 or 0.375, got "' . $text . '"');
        }
        $frac = $m[2] ?? '';
        if (strlen($frac) > $decimals) {
            throw new \InvalidArgumentException($name . ' has more than ' . $decimals . ' decimals');
        }
        $whole = ltrim($m[1], '0') ?: '0';
        $digits = BigNat::add(BigNat::mul($whole, BigNat::pow10($decimals)), ltrim(str_pad($frac, $decimals, '0'), '0') ?: '0');
        if (BigNat::cmp($digits, (string)PHP_INT_MAX) > 0) {
            throw new \InvalidArgumentException($name . ' is out of range');
        }
        return (int)$digits;
    }

    private static function formatDecimal(int $value, int $decimals): string
    {
        $neg = $value < 0;
        $abs = (string)abs($value);
        if ($decimals === 0) {
            return ($neg ? '-' : '') . $abs;
        }
        $abs = str_pad($abs, $decimals + 1, '0', STR_PAD_LEFT);
        $whole = substr($abs, 0, -$decimals);
        $frac = rtrim(substr($abs, -$decimals), '0');
        return ($neg ? '-' : '') . $whole . ($frac !== '' ? '.' . $frac : '');
    }

    private static function amount(int $v, string $name, bool $allowNegative = false): int
    {
        if ($v < ($allowNegative ? -PHP_INT_MAX : 0)) {
            throw new \InvalidArgumentException($name . ' is out of range');
        }
        return $v;
    }

    private static function int(mixed $v, string $name, int $min, int $max): int
    {
        if (!is_int($v)) {
            throw new \InvalidArgumentException($name . ' must be an integer');
        }
        if ($v < $min || $v > $max) {
            throw new \InvalidArgumentException($name . ' must be from ' . $min . ' to ' . $max);
        }
        return $v;
    }

    /** @return array{bonusBps: int, start: ?int, end: ?int, repeat: string} */
    private static function window(mixed $w, int $i): array
    {
        if (!is_array($w)) {
            throw new \InvalidArgumentException('bonus window ' . $i . ' must be an array');
        }
        $repeat = $w['repeat'] ?? 'none';
        if (!is_string($repeat) || !array_key_exists($repeat, self::PERIODS)) {
            throw new \InvalidArgumentException('bonus window ' . $i . ': repeat must be none, daily or weekly');
        }
        $bps = self::int($w['bonusBps'] ?? null, 'bonus window ' . $i . ' bonusBps', 0, self::MAX_BONUS_BPS);
        $start = $w['start'] ?? null;
        $end = $w['end'] ?? null;
        if ($start !== null && !is_int($start) || $end !== null && !is_int($end)) {
            throw new \InvalidArgumentException('bonus window ' . $i . ': start and end must be integers or null');
        }
        if ($start !== null && $end !== null && $end <= $start) {
            throw new \InvalidArgumentException('bonus window ' . $i . ': end must be after start');
        }
        if ($repeat !== 'none') {
            if ($start === null || $end === null) {
                throw new \InvalidArgumentException('bonus window ' . $i . ': a repeating window needs a start and an end');
            }
            if ($end - $start >= self::PERIODS[$repeat]) {
                throw new \InvalidArgumentException('bonus window ' . $i . ': a ' . $repeat . ' window must be shorter than its period');
            }
        }
        return ['bonusBps' => $bps, 'start' => $start, 'end' => $end, 'repeat' => $repeat];
    }

    /** @param array{bonusBps: int, start: ?int, end: ?int, repeat: string} $w */
    private static function windowActive(array $w, int $t): bool
    {
        if ($w['repeat'] === 'none') {
            return ($w['start'] === null || $w['start'] <= $t) && ($w['end'] === null || $t < $w['end']);
        }
        if ($t < $w['start']) {
            return false;
        }
        return ($t - $w['start']) % self::PERIODS[$w['repeat']] < $w['end'] - $w['start'];
    }
}
