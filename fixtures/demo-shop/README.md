# shop (Mandat demo)

Demo repository for the Mandat NOIT demo. A tiny cart with a 10% discount over 50 EUR.

- `.mandat.yml` — the Mandat policy (v2); Mandat reads it only from the trusted base commit.
- `.github/workflows/ci.yml` — CI runs the tests from the PR head, so a deleted test is still green there.

```sh
npm ci --ignore-scripts
npx vitest run
```
