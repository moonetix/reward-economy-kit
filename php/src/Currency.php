<?php

declare(strict_types=1);

namespace Moonetix\RewardEconomy;

/** A validated currency definition. Create it with RewardEconomy::defineCurrency(). */
final class Currency
{
    public function __construct(
        public readonly string $rate,
        public readonly int $rateMicros,
        public readonly int $userShareBps,
        public readonly int $decimals,
        public readonly string $rounding,
        public readonly string $redemptionRate,
        public readonly int $redemptionRateMicros,
    ) {
    }
}
