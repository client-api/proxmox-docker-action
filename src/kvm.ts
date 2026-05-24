// /dev/kvm permission setup + detection. Linux-only; on other platforms
// the action's start-container step won't pass --device /dev/kvm
// regardless of what this returns.

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'node:fs';
import type { Product } from './inputs.js';

/**
 * Configure /dev/kvm so Docker can pass it into the container, then
 * report whether the device ended up readable+writable.
 *
 * - product !== 'pve' → KVM is irrelevant; reports false.
 * - mode === 'false'  → skipped on demand; reports false.
 * - /dev/kvm missing  → not a kernel that supports it; reports false
 *                       (or throws if mode === 'true').
 * - otherwise         → installs the udev rule documented at
 *   https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/
 *   reloads udev, waits for events to settle, and double-chmods the
 *   device. Reports the resulting r+w state.
 */
export async function setupKvm(product: Product, mode: 'auto' | 'true' | 'false'): Promise<boolean> {
  if (product !== 'pve' || mode === 'false') {
    core.info(`[kvm] skipping (product=${product}, mode=${mode})`);
    return false;
  }

  if (!fs.existsSync('/dev/kvm')) {
    if (mode === 'true') {
      throw new Error(
        '/dev/kvm not present on runner but enable-kvm=true was requested. ' +
          "Use a runner with nested virtualisation (e.g. 'ubuntu-latest') or set enable-kvm=auto/false.",
      );
    }
    core.notice('/dev/kvm not present on runner — VM lifecycle endpoints will not work');
    return false;
  }

  core.info('[kvm] installing udev rule + chmod for /dev/kvm');
  const rule = 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"\n';
  await exec.exec('sudo', ['tee', '/etc/udev/rules.d/99-kvm4all.rules'], {
    input: Buffer.from(rule),
    silent: true,
  });
  await exec.exec('sudo', ['udevadm', 'control', '--reload-rules']);
  await exec.exec('sudo', ['udevadm', 'trigger', '--name-match=kvm']);
  // `udevadm trigger` is async — settle waits for the resulting
  // events to finish so the next stat() sees the new permissions.
  // Belt-and-braces chmod for unusually slow udev implementations.
  await exec.exec('sudo', ['udevadm', 'settle', '--timeout=5']);
  await exec.exec('sudo', ['chmod', '0666', '/dev/kvm'], { ignoreReturnCode: true });

  // Re-check readability after the udev dust settles.
  try {
    fs.accessSync('/dev/kvm', fs.constants.R_OK | fs.constants.W_OK);
    core.info(`[kvm] /dev/kvm ready (${describeMode('/dev/kvm')})`);
    return true;
  } catch {
    if (mode === 'true') {
      throw new Error('/dev/kvm still not r+w after udev reload + chmod');
    }
    core.warning('/dev/kvm exists but is not r+w after udev reload — VM lifecycle endpoints will not work');
    return false;
  }
}

function describeMode(path: string): string {
  try {
    const s = fs.statSync(path);
    return `mode=${(s.mode & 0o777).toString(8)} uid=${s.uid} gid=${s.gid}`;
  } catch {
    return '(stat failed)';
  }
}
