<?php

declare(strict_types=1);

// Plain test runner: php php/tests/run.php
// Runs the shared vectors in test-vectors/vectors.json plus a few PHP-specific checks.

require __DIR__ . '/../src/BigNat.php';
require __DIR__ . '/../src/Currency.php';
require __DIR__ . '/../src/RewardEconomy.php';

use Moonetix\RewardEconomy\BigNat;
use Moonetix\RewardEconomy\Currency;
use Moonetix\RewardEconomy\RewardEconomy as E;

$vectors = json_decode((string)file_get_contents(__DIR__ . '/../../test-vectors/vectors.json'), true, 512, JSON_THROW_ON_ERROR);

/** Decimal string from a vector into a PHP int. Strings beyond 64 bits are invalid input for the PHP API. */
function vint(string $s): int
{
    if (!preg_match('/^-?\d+$/', $s)) {
        throw new InvalidArgumentException('not an integer: ' . $s);
    }
    $abs = ltrim($s, '-');
    if (BigNat::cmp(ltrim($abs, '0') ?: '0', (string)PHP_INT_MAX) > 0) {
        throw new InvalidArgumentException('out of range: ' . $s);
    }
    return (int)$s;
}

function vopt(array $c, string $key): ?int
{
    return array_key_exists($key, $c) && $c[$key] !== null ? vint($c[$key]) : null;
}

/** @param array<string, mixed> $a */
function strs(array $a): array
{
    return array_map(static fn($v) => is_int($v) ? (string)$v : $v, $a);
}

function currencyOut(Currency $c): array
{
    return [
        'rate' => $c->rate,
        'rateMicros' => (string)$c->rateMicros,
        'userShareBps' => $c->userShareBps,
        'decimals' => $c->decimals,
        'rounding' => $c->rounding,
        'redemptionRate' => $c->redemptionRate,
        'redemptionRateMicros' => (string)$c->redemptionRateMicros,
    ];
}

function giftCard(?array $g): ?array
{
    return $g === null ? null : ['faceMicros' => vint($g['faceMicros']), 'cost' => vint($g['cost'])];
}

$runners = [
    'parseUsd' => fn(array $c) => (string)E::parseUsd($c['in']),
    'formatUsd' => fn(array $c) => E::formatUsd(vint($c['in'])),
    'parseUnits' => fn(array $c) => (string)E::parseUnits($c['in'], $c['decimals']),
    'formatUnits' => fn(array $c) => E::formatUnits(vint($c['in']), $c['decimals']),
    'divRound' => fn(array $c) => E::divRound($c['n'], $c['d'], $c['mode']),
    'defineCurrency' => fn(array $c) => currencyOut(E::defineCurrency($c['config'])),
    'pointsForPayout' => fn(array $c) => (string)E::pointsForPayout(vint($c['payout']), $c['currency'], $c['bonusBps'] ?? 0),
    'pointsToUsd' => fn(array $c) => (string)E::pointsToUsd(vint($c['units']), $c['currency'], $c['rounding'] ?? 'floor'),
    'usdToPoints' => fn(array $c) => (string)E::usdToPoints(vint($c['micros']), $c['currency'], $c['rounding'] ?? 'ceil'),
    'giftCardCost' => fn(array $c) => (string)E::giftCardCost(vint($c['face']), $c['currency'], $c['feeBps'] ?? 0, vopt($c, 'feeMicros') ?? 0),
    'checkCashout' => fn(array $c) => strs(E::checkCashout(vint($c['balance']), vint($c['cost']), vopt($c, 'minimum') ?? 0)),
    'activeBonusBps' => fn(array $c) => E::activeBonusBps($c['windows'], $c['at']),
    'reversalAmount' => fn(array $c) => (string)E::reversalAmount(vint($c['credited']), vopt($c, 'alreadyReversed') ?? 0, vopt($c, 'requested')),
    'applyReversal' => fn(array $c) => strs(E::applyReversal(
        vint($c['balance']),
        vint($c['credited']),
        vopt($c, 'alreadyReversed') ?? 0,
        vopt($c, 'requested'),
        $c['allowNegativeBalance'] ?? true,
    )),
    'inflationCheck' => fn(array $c) => strs(E::inflationCheck($c['currency'], $c['bonusBps'] ?? 0, giftCard($c['giftCard'] ?? null))),
    'moonetixCurrency' => function (array $c) {
        $p = $c['preset'];
        $currency = E::moonetixCurrency($p['rate'], $p['splitPercent'], $p['rounding']);
        $bonus = isset($c['bonusPercent']) ? E::moonetixBonusBps($c['bonusPercent']) : 0;
        $units = E::pointsForPayout(E::parseUsd($c['payout']), $currency, $bonus);
        $text = E::formatUnits($units, $currency->decimals);
        if ($text !== $c['text']) {
            throw new LogicException('formatted reward ' . $text . ' !== ' . $c['text']);
        }
        return (string)$units;
    },
    'moonetixBonusBps' => fn(array $c) => E::moonetixBonusBps($c['in']),
];

$pass = 0;
$fail = 0;
$check = static function (bool $ok, string $label, string $detail = '') use (&$pass, &$fail): void {
    if ($ok) {
        $pass++;
        return;
    }
    $fail++;
    fwrite(STDERR, "FAIL {$label}" . ($detail !== '' ? ": {$detail}" : '') . "\n");
};

$groups = array_keys(array_filter($vectors, 'is_array'));
sort($groups);
$names = array_keys($runners);
sort($names);
$check($groups === $names, 'every vector group has a runner', implode(',', array_diff($groups, $names)));

foreach ($runners as $group => $run) {
    foreach ($vectors[$group] as $i => $c) {
        $label = "{$group}[{$i}]" . (isset($c['name']) ? ' ' . $c['name'] : '');
        if (!empty($c['throws'])) {
            try {
                $run($c);
                $check(false, $label, 'expected an exception');
            } catch (InvalidArgumentException | RangeException | TypeError) {
                $check(true, $label);
            }
            continue;
        }
        try {
            $got = $run($c);
        } catch (Throwable $e) {
            $check(false, $label, get_class($e) . ': ' . $e->getMessage());
            continue;
        }
        $check($got === $c['out'], $label, var_export($got, true) . ' !== ' . var_export($c['out'], true));
    }
}

// PHP-specific: BigNat against known products, and that floats never sneak in.
$check(BigNat::mul('99999999999999999999', '99999999999999999999') === '9999999999999999999800000000000000000001', 'BigNat::mul');
$check(BigNat::divmod('9999999999999999999800000000000000000001', '99999999999999999999') === ['99999999999999999999', '0'], 'BigNat::divmod');
$check(BigNat::sub('1000000000000000000000', '1') === '999999999999999999999', 'BigNat::sub');
$points = E::pointsForPayout(333_000, ['rate' => '100', 'userShareBps' => 5000]);
$check(is_int($points), 'pointsForPayout returns int');
try {
    E::pointsForPayout(500_000, ['rate' => 1.5, 'userShareBps' => 5000]);
    $check(false, 'float rate rejected');
} catch (InvalidArgumentException) {
    $check(true, 'float rate rejected');
}

echo "{$pass} passed, {$fail} failed\n";
exit($fail === 0 ? 0 : 1);
