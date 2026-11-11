<?php

declare(strict_types=1);

namespace Moonetix\RewardEconomy;

/**
 * Arbitrary-size non-negative integers as decimal strings.
 *
 * Products like payout x rate x share x bonus overflow 64 bits long before the
 * result does, and bcmath or gmp are not always installed, so the few
 * operations the library needs live here.
 *
 * @internal
 */
final class BigNat
{
    public static function of(int $v): string
    {
        if ($v < 0) {
            throw new \InvalidArgumentException('BigNat values are non-negative');
        }
        return (string)$v;
    }

    public static function pow10(int $n): string
    {
        return '1' . str_repeat('0', $n);
    }

    public static function cmp(string $a, string $b): int
    {
        $la = strlen($a);
        $lb = strlen($b);
        if ($la !== $lb) {
            return $la <=> $lb;
        }
        return strcmp($a, $b) <=> 0;
    }

    public static function add(string $a, string $b): string
    {
        $out = '';
        $carry = 0;
        for ($i = strlen($a) - 1, $j = strlen($b) - 1; $i >= 0 || $j >= 0 || $carry; $i--, $j--) {
            $s = $carry + ($i >= 0 ? ord($a[$i]) - 48 : 0) + ($j >= 0 ? ord($b[$j]) - 48 : 0);
            $out .= chr(48 + $s % 10);
            $carry = intdiv($s, 10);
        }
        return self::trim(strrev($out));
    }

    /** $a - $b with $a >= $b. */
    public static function sub(string $a, string $b): string
    {
        $out = '';
        $borrow = 0;
        for ($i = strlen($a) - 1, $j = strlen($b) - 1; $i >= 0; $i--, $j--) {
            $d = ord($a[$i]) - 48 - $borrow - ($j >= 0 ? ord($b[$j]) - 48 : 0);
            $borrow = $d < 0 ? 1 : 0;
            $out .= chr(48 + $d + 10 * $borrow);
        }
        return self::trim(strrev($out));
    }

    public static function mul(string ...$factors): string
    {
        $acc = '1';
        foreach ($factors as $f) {
            $acc = self::mul2($acc, $f);
        }
        return $acc;
    }

    /** @return array{0: string, 1: string} quotient and remainder */
    public static function divmod(string $a, string $b): array
    {
        if ($b === '0') {
            throw new \DivisionByZeroError('division by zero');
        }
        $q = '';
        $r = '0';
        $len = strlen($a);
        for ($i = 0; $i < $len; $i++) {
            $r = self::trim($r . $a[$i]);
            $digit = 0;
            while (self::cmp($r, $b) >= 0) {
                $r = self::sub($r, $b);
                $digit++;
            }
            $q .= (string)$digit;
        }
        return [self::trim($q), $r];
    }

    public static function toInt(string $v, string $name): int
    {
        if (self::cmp($v, (string)PHP_INT_MAX) > 0) {
            throw new \RangeException($name . ' exceeds MAX_AMOUNT');
        }
        return (int)$v;
    }

    private static function mul2(string $a, string $b): string
    {
        if ($a === '0' || $b === '0') {
            return '0';
        }
        // Little-endian limbs of 4 digits keep every partial product well inside 64 bits.
        $la = self::limbs($a);
        $lb = self::limbs($b);
        $res = array_fill(0, count($la) + count($lb), 0);
        foreach ($la as $i => $x) {
            $carry = 0;
            foreach ($lb as $j => $y) {
                $t = $res[$i + $j] + $x * $y + $carry;
                $res[$i + $j] = $t % 10000;
                $carry = intdiv($t, 10000);
            }
            $k = $i + count($lb);
            while ($carry > 0) {
                $t = $res[$k] + $carry;
                $res[$k] = $t % 10000;
                $carry = intdiv($t, 10000);
                $k++;
            }
        }
        $out = '';
        for ($i = count($res) - 1; $i >= 0; $i--) {
            $out .= str_pad((string)$res[$i], 4, '0', STR_PAD_LEFT);
        }
        return self::trim($out);
    }

    /** @return list<int> */
    private static function limbs(string $s): array
    {
        $out = [];
        for ($i = strlen($s); $i > 0; $i -= 4) {
            $out[] = (int)substr($s, max(0, $i - 4), $i - max(0, $i - 4));
        }
        return $out;
    }

    private static function trim(string $s): string
    {
        $t = ltrim($s, '0');
        return $t === '' ? '0' : $t;
    }
}
