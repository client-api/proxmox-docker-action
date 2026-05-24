// Post-step: runs at job end (`post-if: always()`).
// Cleans up the container started by main.ts so callers don't have
// to remember to `docker stop` it themselves.

import * as core from '@actions/core';
import { stopContainer } from './container.js';

const STATE_CONTAINER_NAME = 'container_name';

async function cleanup(): Promise<void> {
  const containerName = core.getState(STATE_CONTAINER_NAME);
  if (!containerName) {
    // main.ts never reached the point of starting a container (early
    // failure, or the action wasn't actually invoked). Nothing to do.
    core.info('[post] no container in state — skipping cleanup');
    return;
  }

  core.info(`[post] stopping ${containerName}`);
  await stopContainer(containerName);
}

cleanup().catch((err: unknown) => {
  // Cleanup failures don't fail the job — at worst we leak a
  // container that the runner's tear-down will reap anyway.
  const message = err instanceof Error ? err.message : String(err);
  core.warning(`cleanup error (ignored): ${message}`);
});
