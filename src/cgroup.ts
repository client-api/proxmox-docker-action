// Cgroup v2 detection. PVE 9's LXC stack requires the unified
// hierarchy; without it `pct start` writes an unparseable empty
// cpuset.cpus line.

import * as core from '@actions/core';
import * as fs from 'node:fs';

/** True when the kernel exposes the cgroup v2 unified hierarchy. */
export function hasCgroupV2(): boolean {
  const present = fs.existsSync('/sys/fs/cgroup/cgroup.controllers');
  if (present) {
    core.info('[cgroupv2] unified hierarchy present');
  } else {
    core.notice('host runs cgroup v1 — LXC lifecycle endpoints will not work in PVE');
  }
  return present;
}
