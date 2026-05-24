// Input resolution + validation. Pure helpers — no I/O.

import * as core from '@actions/core';

export type Product = 'pve' | 'pbs' | 'pmg' | 'pdm';

const PRODUCT_API_PORT: Record<Product, number> = {
  pve: 8006,
  pbs: 8007,
  pmg: 8006,
  pdm: 8443,
};

export interface ResolvedInputs {
  product: Product;
  tag: string;
  registry: string;
  image: string;
  containerName: string;
  hostPort: number;
  apiPort: number;
  envPrefix: string;
  enableKvm: 'auto' | 'true' | 'false';
  seedFixtureVm: boolean;
  seedFixtureCt: boolean;
  rootPassword: string;
  waitTimeoutSec: number;
}

function asBool(value: string, field: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  throw new Error(`${field} must be true|false (got '${value}')`);
}

function asProduct(value: string): Product {
  const v = value.trim().toLowerCase();
  if (v === 'pve' || v === 'pbs' || v === 'pmg' || v === 'pdm') return v;
  throw new Error(`product must be one of pve|pbs|pmg|pdm (got '${value}')`);
}

function asEnableKvm(value: string): 'auto' | 'true' | 'false' {
  const v = value.trim().toLowerCase();
  if (v === 'auto' || v === 'true' || v === 'false') return v;
  throw new Error(`enable-kvm must be auto|true|false (got '${value}')`);
}

export function resolveInputs(): ResolvedInputs {
  const product = asProduct(core.getInput('product', { required: true }));
  const tag = core.getInput('tag') || 'latest';
  const registry = core.getInput('registry') || 'ghcr.io/client-api/proxmox-docker';
  const containerName = core.getInput('container-name') || `${product}-test`;
  const apiPort = PRODUCT_API_PORT[product];
  const hostPortRaw = core.getInput('host-port');
  const hostPort = hostPortRaw ? parseInt(hostPortRaw, 10) : apiPort;
  if (Number.isNaN(hostPort) || hostPort <= 0 || hostPort > 65535) {
    throw new Error(`host-port must be a valid TCP port (got '${hostPortRaw}')`);
  }
  const envPrefix = core.getInput('env-prefix') || 'PROXMOX';
  const enableKvm = asEnableKvm(core.getInput('enable-kvm') || 'auto');
  const seedFixtureVm = asBool(core.getInput('seed-fixture-vm') || 'true', 'seed-fixture-vm');
  const seedFixtureCt = asBool(core.getInput('seed-fixture-ct') || 'true', 'seed-fixture-ct');
  const rootPassword = core.getInput('root-password');
  const waitTimeoutSec = parseInt(core.getInput('wait-timeout') || '120', 10);
  if (Number.isNaN(waitTimeoutSec) || waitTimeoutSec <= 0) {
    throw new Error(`wait-timeout must be a positive integer (got '${core.getInput('wait-timeout')}')`);
  }

  return {
    product,
    tag,
    registry,
    image: `${registry}/${product}-test:${tag}`,
    containerName,
    hostPort,
    apiPort,
    envPrefix,
    enableKvm,
    seedFixtureVm,
    seedFixtureCt,
    rootPassword,
    waitTimeoutSec,
  };
}
