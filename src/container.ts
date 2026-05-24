// Container lifecycle — pure arg builder + side-effecting docker calls.
// Each function does one thing; the orchestration layer in main.ts
// composes them.

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import type { Product, ResolvedInputs } from './inputs.js';

export interface StartedContainer {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly hostPort: number;
}

/**
 * Build the `docker run` argument list for a given product. Pure
 * function — no I/O — so it can be unit-tested in isolation.
 */
export function buildRunArgs(inputs: ResolvedInputs, kvmAvailable: boolean): string[] {
  const args: string[] = [
    'run',
    '--detach',
    '--rm',
    '--name', inputs.containerName,
    '--privileged',
    '--publish', `${inputs.hostPort}:${inputs.apiPort}`,
    '--health-cmd', '/usr/local/sbin/healthcheck.sh',
    '--health-interval', '5s',
    '--health-timeout', '5s',
    '--health-retries', '30',
  ];

  args.push(...perProductRunArgs(inputs.product, kvmAvailable));
  args.push(...fixtureEnvArgs(inputs));
  if (inputs.rootPassword) {
    args.push('--env', `${rootPasswordEnvKey(inputs.product)}=${inputs.rootPassword}`);
  }
  args.push(inputs.image);
  return args;
}

function perProductRunArgs(product: Product, kvmAvailable: boolean): string[] {
  switch (product) {
    case 'pve': {
      // Systemd as PID 1 needs the tmpfs trio; pmxcfs needs /dev/fuse.
      // /dev/kvm is passed through only when the runner exposes it
      // (kvm.ts has verified r+w by this point).
      const args = [
        '--device', '/dev/fuse',
        '--tmpfs', '/tmp',
        '--tmpfs', '/run',
        '--tmpfs', '/run/lock',
        '--health-start-period', '60s',
      ];
      if (kvmAvailable) {
        args.push('--device', '/dev/kvm');
      }
      return args;
    }
    case 'pmg':
      // PostgreSQL + pmgdaemon + pmgproxy as plain forked daemons; no
      // pmxcfs, but /dev/fuse is still a hard dep for some subsystems.
      return ['--device', '/dev/fuse', '--health-start-period', '20s'];
    case 'pbs':
    case 'pdm':
      return ['--health-start-period', '20s'];
  }
}

function fixtureEnvArgs(inputs: ResolvedInputs): string[] {
  if (inputs.product !== 'pve') return [];
  return [
    '--env', `PVE_SEED_FIXTURE_VM=${inputs.seedFixtureVm ? '1' : '0'}`,
    '--env', `PVE_SEED_FIXTURE_CT=${inputs.seedFixtureCt ? '1' : '0'}`,
  ];
}

function rootPasswordEnvKey(product: Product): string {
  return `${product.toUpperCase()}_ROOT_PASSWORD`;
}

/**
 * Start the container and return a handle. Idempotent: any stale
 * container with the same name is removed first so action re-runs
 * (local act, nightly retries, …) don't trip over a leftover.
 */
export async function startContainer(
  inputs: ResolvedInputs,
  kvmAvailable: boolean,
): Promise<StartedContainer> {
  await removeStaleContainer(inputs.containerName);

  const args = buildRunArgs(inputs, kvmAvailable);
  core.info(`[start] docker ${args.join(' ')}`);
  await exec.exec('docker', args);

  const id = await dockerInspectField(inputs.containerName, '{{.Id}}');
  return {
    id,
    name: inputs.containerName,
    url: `https://localhost:${inputs.hostPort}`,
    hostPort: inputs.hostPort,
  };
}

async function removeStaleContainer(name: string): Promise<void> {
  const code = await exec.exec('docker', ['inspect', name], {
    silent: true,
    ignoreReturnCode: true,
  });
  if (code === 0) {
    core.info(`[start] removing stale container '${name}'`);
    await exec.exec('docker', ['rm', '-f', name], { silent: true });
  }
}

async function dockerInspectField(name: string, format: string): Promise<string> {
  let out = '';
  await exec.exec('docker', ['inspect', '-f', format, name], {
    silent: true,
    listeners: { stdout: (data) => (out += data.toString()) },
  });
  return out.trim();
}

/**
 * Poll Docker's healthcheck status until `healthy`, or throw after
 * the configured timeout. Dumps `docker logs` on failure so the
 * caller can see what happened without re-running with `--debug`.
 */
export async function waitForHealthy(name: string, timeoutSec: number): Promise<void> {
  const deadline = Date.now() + timeoutSec * 1000;
  let lastStatus = '';
  while (Date.now() < deadline) {
    const status = await readHealthStatus(name);
    if (status !== lastStatus) {
      core.info(`[wait] ${name} health=${status}`);
      lastStatus = status;
    }
    if (status === 'healthy') return;
    if (status === 'unhealthy' || status === 'missing') {
      await dumpLogs(name);
      throw new Error(`${name} reported ${status}`);
    }
    await sleep(2000);
  }
  await dumpLogs(name);
  throw new Error(`${name} did not become healthy within ${timeoutSec}s`);
}

async function readHealthStatus(name: string): Promise<string> {
  let out = '';
  const code = await exec.exec('docker', ['inspect', '-f', '{{.State.Health.Status}}', name], {
    silent: true,
    ignoreReturnCode: true,
    listeners: { stdout: (data) => (out += data.toString()) },
  });
  if (code !== 0) return 'missing';
  return out.trim() || 'unknown';
}

async function dumpLogs(name: string): Promise<void> {
  core.startGroup(`docker logs ${name}`);
  await exec.exec('docker', ['logs', name], { ignoreReturnCode: true });
  core.endGroup();
}

/**
 * Stop the container. Best-effort: a missing or already-stopped
 * container is not an error — this runs from the post-step where we
 * want job-end cleanup to be silent.
 */
export async function stopContainer(name: string): Promise<void> {
  await exec.exec('docker', ['stop', '--time', '5', name], { ignoreReturnCode: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
