// Entry point invoked by the runner at action start.
// Composition root: depends on every module, but each call here is a
// single high-level intent.

import * as core from '@actions/core';
import { resolveInputs } from './inputs.js';
import { setupKvm } from './kvm.js';
import { hasCgroupV2 } from './cgroup.js';
import { startContainer, waitForHealthy } from './container.js';
import { exportCredentials } from './credentials.js';

const STATE_CONTAINER_NAME = 'container_name';

async function run(): Promise<void> {
  const inputs = resolveInputs();

  const kvmAvailable = await setupKvm(inputs.product, inputs.enableKvm);
  const cgroupv2Available = hasCgroupV2();

  const container = await startContainer(inputs, kvmAvailable);
  // Save before waiting so the post-step can clean up even if
  // healthcheck never flips green.
  core.saveState(STATE_CONTAINER_NAME, container.name);

  await waitForHealthy(container.name, inputs.waitTimeoutSec);
  const credentialsPath = await exportCredentials(
    container.name,
    container.hostPort,
    inputs.envPrefix,
  );

  setActionOutputs({
    containerId: container.id,
    containerName: container.name,
    url: container.url,
    hostPort: container.hostPort,
    credentialsPath,
    kvmAvailable,
    cgroupv2Available,
  });
}

interface ActionOutputs {
  readonly containerId: string;
  readonly containerName: string;
  readonly url: string;
  readonly hostPort: number;
  readonly credentialsPath: string;
  readonly kvmAvailable: boolean;
  readonly cgroupv2Available: boolean;
}

function setActionOutputs(o: ActionOutputs): void {
  core.setOutput('container-id', o.containerId);
  core.setOutput('container-name', o.containerName);
  core.setOutput('url', o.url);
  core.setOutput('host-port', String(o.hostPort));
  core.setOutput('credentials-json-path', o.credentialsPath);
  core.setOutput('kvm-available', String(o.kvmAvailable));
  core.setOutput('cgroupv2-available', String(o.cgroupv2Available));
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  core.setFailed(message);
});
