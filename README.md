# DeepSafe Token Lock

Revocable linear token vesting for the DEF ERC-20 token on BNB Smart Chain. Each allocation is funded when it is created, has an optional cliff, vests linearly from `start` through `end`, and can be released only by its beneficiary.

On revocation, vesting freezes at the current timestamp. Unvested tokens return to the owner while vested, unreleased tokens remain claimable by the beneficiary. Ownership should be assigned to a production multisig.

## Genesis Nodes schedule

Allocations tagged `GenesisNodes` use a two-phase schedule across the configured `start` to `end` interval. The first 30% vests linearly during the first one-third of that interval, and the remaining 70% vests linearly during the final two-thirds. For the intended 18-month schedule, configure `end` 18 months after `start`; this yields 30% vested by month 6 and 100% vested by month 18. Intermediate token amounts use Solidity integer division and may differ slightly from rounded display values.

## Development

```bash
npm install
npm test
npm run coverage
```

Copy `.env.example` to `.env` before using a public network. Replace the zero `initialOwner` placeholder in the matching Ignition parameters file with the multisig address before deployment.

The allocation schedule export is still required before schedule-loading tooling and production parameters can be finalized.
