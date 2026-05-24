# Examples

Copy-paste-able workflow files showing different ways to use
`proxmox-docker-action`. Each one is a complete `.github/workflows/*.yml`.

| File | What it shows |
|------|---------------|
| [`single-product.yml`](./single-product.yml) | Simplest case — one product, one job. |
| [`matrix-all-products.yml`](./matrix-all-products.yml) | Run the suite against PVE/PBS/PMG/PDM in parallel. |
| [`lifecycle-gates.yml`](./lifecycle-gates.yml) | Exercise the fixture VM (`qm start`) and CT (`pct start`) with runner-capability gates. |
| [`stable-vs-dev.yml`](./stable-vs-dev.yml) | Run against both the stable channel and the upstream `dev` channel, with `continue-on-error` on the dev probe. |
| [`multi-language.yml`](./multi-language.yml) | Matrix that runs TypeScript, Python, and Go SDK suites against every product. |

The `pnpm test:e2e:*` calls are placeholders — replace them with
whatever entry point your SDK uses.
