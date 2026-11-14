# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-14

### Changed

- The JavaScript package is on npm as [`@moonetix/reward-economy-kit`](https://www.npmjs.com/package/@moonetix/reward-economy-kit). Its name changed from `reward-economy-kit`, so an install from Git needs the new name in its imports. The functions and the test vectors are the same as in 1.0.0.
- The PHP package is on [Packagist](https://packagist.org/packages/moonetix/reward-economy-kit): `composer require moonetix/reward-economy-kit`.

## [1.0.0] - 2026-11-11

### Added

- JavaScript (ESM, BigInt) and PHP 8.1+ implementations with the same API and behavior.
- `pointsForPayout`: payout to points with rate, user share, bonus and one rounding step.
- Rounding modes `floor` (default), `ceil`, `half-up` and `half-even`, plus `divRound` for your own calculations.
- `pointsToUsd`, `usdToPoints`, `giftCardCost` and `checkCashout` for cash-out pricing and minimums.
- `activeBonusBps` for one-off, daily and weekly bonus windows.
- `reversalAmount` and `applyReversal`, capped at what was credited, with an optional floor at a zero balance.
- `inflationCheck`: payout behind 1,000 points, their redemption value, and the effective user share.
- `moonetixCurrency` and `moonetixBonusBps`, matching the examples in the Moonetix rewards docs.
- Shared test vectors in `test-vectors/vectors.json`, run by both test suites.
- TypeScript declarations in `src/index.d.ts`.

[1.1.0]: https://github.com/moonetix/reward-economy-kit/releases/tag/v1.1.0
[1.0.0]: https://github.com/moonetix/reward-economy-kit/releases/tag/v1.0.0
