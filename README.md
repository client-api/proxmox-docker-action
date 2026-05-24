# proxmox-docker-action

GitHub Action that starts a
[proxmox-docker](https://github.com/client-api/proxmox-docker) test
image, waits for it to become healthy, and exposes the API to the
caller's test steps. Cleans up at job end.

Single product per invocation. Use a matrix to start more than one.

> [!WARNING]
> The underlying images are test-only — hard-coded credentials,
> self-signed TLS, `--privileged` runtime. Don't expose them to the
> public internet.

## Quick start

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    permissions:
      packages: read
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: client-api/proxmox-docker-action@v1
        with:
          product: pve
          tag: '9.2'

      - run: pnpm test:e2e:pve
        env:
          NODE_TLS_REJECT_UNAUTHORIZED: '0'
```

The action exports credentials as `PROXMOX_URL`, `PROXMOX_USER`,
`PROXMOX_PASSWORD`, `PROXMOX_TOKEN_HEADER_VALUE`, and friends — use
`PROXMOX_TOKEN_HEADER_VALUE` as the `Authorization:` header value
verbatim.

## Inputs

| Name                | Default      | Description |
|---------------------|--------------|-------------|
| `product` *         | —            | One of `pve`, `pbs`, `pmg`, `pdm`. |
| `tag`               | `latest`     | Image tag. |
| `registry`          | `ghcr.io/client-api/proxmox-docker` | Container registry. |
| `container-name`    | `<product>-test` | Docker container name. |
| `host-port`         | product default | Host port (8006 PVE/PMG, 8007 PBS, 8443 PDM). |
| `env-prefix`        | `PROXMOX`    | Prefix for env vars exported to `$GITHUB_ENV`. |
| `enable-kvm`        | `auto`       | `auto`/`true`/`false`. With `auto`, sets up `/dev/kvm` if available. |
| `seed-fixture-vm`   | `true`       | (PVE) Seed VM 100 (`tiny-test`). |
| `seed-fixture-ct`   | `true`       | (PVE) Seed CT 200 (`tiny-ct`). |
| `root-password`     | `proxmox123` | Override root@pam password. |
| `wait-timeout`      | `120`        | Max seconds to wait for healthy. |

`*` required.

## Outputs

| Name                    | Description |
|-------------------------|-------------|
| `container-id`          | Docker container ID. |
| `container-name`        | Resolved container name. |
| `url`                   | API URL (`https://localhost:<port>`). |
| `host-port`             | Bound host port. |
| `credentials-json-path` | Path to credentials JSON copied from the container. |
| `kvm-available`         | `"true"`/`"false"` — gate VM-lifecycle steps. |
| `cgroupv2-available`    | `"true"`/`"false"` — gate LXC-lifecycle steps. |

## Matrix across all four products

```yaml
strategy:
  fail-fast: false
  matrix:
    product: [pve, pbs, pmg, pdm]

steps:
  - uses: actions/checkout@v4
  - uses: docker/login-action@v3
    with:
      registry: ghcr.io
      username: ${{ github.actor }}
      password: ${{ secrets.GITHUB_TOKEN }}
  - uses: client-api/proxmox-docker-action@v1
    with:
      product: ${{ matrix.product }}
      tag: '9.2'
  - run: pnpm test:e2e:${{ matrix.product }}
    env:
      NODE_TLS_REJECT_UNAUTHORIZED: '0'
```

## Gating VM / LXC lifecycle steps

```yaml
- id: proxmox
  uses: client-api/proxmox-docker-action@v1
  with: { product: pve, tag: '9.2' }

- name: VM lifecycle
  if: steps.proxmox.outputs.kvm-available == 'true'
  run: |
    docker exec pve-test qm start 100
    docker exec pve-test qm shutdown 100

- name: CT lifecycle
  if: steps.proxmox.outputs.cgroupv2-available == 'true'
  run: |
    docker exec pve-test pct start 200
    docker exec pve-test pct exec 200 -- sh -c 'echo alpine'
    docker exec pve-test pct stop 200
```

## Development

```bash
npm install
npm run typecheck
npm run bundle     # rebuilds dist/main + dist/post
```

`dist/` is committed because GitHub Actions runs the bundled JS
directly with no `npm install` step.

## License

Apache 2.0 — see [LICENSE](./LICENSE).
