// Credentials JSON → $GITHUB_ENV. Reads /run/credentials.json out of
// the running container and lifts every field under the configured
// prefix. Masks secrets so later steps echoing the environment don't
// leak them.

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SECRET_FIELDS = new Set(['password', 'token_value']);
const NON_SECRET_TOKEN_SENTINELS = new Set(['(unavailable)', '(unsupported-by-pmg)']);

interface Credentials {
  readonly [key: string]: string;
}

/**
 * Read the credentials JSON out of the container, lift each field to
 * `<prefix>_<UPPER_FIELD>=value` in $GITHUB_ENV, and force-set the URL
 * to the host port (the container's own `url` field references its
 * internal hostname which the caller can't reach).
 */
export async function exportCredentials(
  containerName: string,
  hostPort: number,
  envPrefix: string,
): Promise<string> {
  const credsPath = await copyCredentialsOut(containerName);
  const creds = parseCredentials(credsPath);

  maskSecrets(creds);
  exportToEnv(creds, envPrefix);

  // Override URL with the host-port form so caller tests hit the
  // reachable endpoint, not the container's internal hostname.
  core.exportVariable(`${envPrefix}_URL`, `https://localhost:${hostPort}`);

  core.info(`[creds] exported ${envPrefix}_* (URL: https://localhost:${hostPort})`);
  return credsPath;
}

async function copyCredentialsOut(containerName: string): Promise<string> {
  const dest = path.join(os.tmpdir(), 'proxmox-credentials.json');

  let captured = '';
  const code = await exec.exec(
    'docker',
    ['exec', containerName, 'cat', '/run/credentials.json'],
    {
      silent: true,
      ignoreReturnCode: true,
      listeners: { stdout: (data) => (captured += data.toString()) },
    },
  );
  if (code !== 0 || !captured.trim()) {
    throw new Error(
      `/run/credentials.json missing or empty inside ${containerName} (docker exec rc=${code})`,
    );
  }

  fs.writeFileSync(dest, captured, 'utf8');
  return dest;
}

function parseCredentials(filePath: string): Credentials {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`credentials JSON must be an object, got ${typeof parsed}`);
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    result[key] = String(value);
  }
  return result;
}

function maskSecrets(creds: Credentials): void {
  for (const field of SECRET_FIELDS) {
    const value = creds[field];
    if (value && !NON_SECRET_TOKEN_SENTINELS.has(value)) {
      core.setSecret(value);
    }
  }
}

function exportToEnv(creds: Credentials, prefix: string): void {
  for (const [key, value] of Object.entries(creds)) {
    core.exportVariable(`${prefix}_${key.toUpperCase()}`, value);
  }
}
