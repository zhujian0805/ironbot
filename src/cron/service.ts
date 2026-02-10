import type { CronJobCreate, CronJobPatch } from "./types.ts";
import * as ops from "./service/ops.ts";
import { createCronServiceState, type CronServiceDeps } from "./service/state.ts";
import chokidar from "chokidar";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureLoaded } from "./service/store.ts";
import { armTimer } from "./service/timer.ts";
import { locked } from "./service/locked.ts";

export class CronService {
  private readonly state;
  private fileWatcher: chokidar.FSWatcher | null = null;

  constructor(deps: CronServiceDeps) {
    this.state = createCronServiceState(deps);
  }

  async start() {
    console.log("Starting cron service...");
    await ops.start(this.state);

    // Set up file watcher to monitor jobs.json for external changes
    await this.setupFileWatcher();
  }

  private async setupFileWatcher() {
    const storePath = this.state.deps.storePath;
    const storeDir = path.dirname(storePath);
    const storeFileName = path.basename(storePath);

    try {
      // Ensure the store directory exists
      await fs.mkdir(storeDir, { recursive: true });

      this.fileWatcher = chokidar.watch(storeDir, {
        ignored: (watchedPath) => path.basename(watchedPath).startsWith("."), // ignore dotfiles without skipping the store directory itself
        persistent: true,
        ignoreInitial: true // don't trigger on initial scan
      });

      this.fileWatcher.on('change', async (changedPath) => {
        if (path.basename(changedPath) === storeFileName) {
          this.state.deps.log.info(
            { changedFile: changedPath },
            "cron: jobs.json file changed externally, reloading jobs"
          );

          // Use the same locked pattern as other ops
          await locked(this.state, async () => {
            try {
              // Force reload the store from disk
              await ensureLoaded(this.state, { forceReload: true });

              // Re-arm the timer to pick up any new jobs
              armTimer(this.state);

              this.state.deps.log.info(
                { storePath, jobCount: this.state.store?.jobs.length ?? 0 },
                "cron: jobs reloaded from file"
              );
            } catch (error) {
              this.state.deps.log.error(
                { error: String(error) },
                "cron: failed to reload jobs from file"
              );
            }
          });
        }
      });

      this.state.deps.log.info(
        { watchedPath: storeDir },
        "cron: file watcher set up for jobs.json monitoring"
      );
    } catch (error) {
      this.state.deps.log.error(
        { error: String(error) },
        "cron: failed to set up file watcher for jobs.json"
      );
    }
  }

  stop() {
    console.log("Stopping cron service...");

    // Close the file watcher
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    ops.stop(this.state);
  }

  async status() {
    return await ops.status(this.state);
  }

  async list() {
    return await ops.list(this.state);
  }

  async add(input: CronJobCreate) {
    const result = await ops.add(this.state, input);

    // Explicitly re-arm timer after adding to ensure the new job is scheduled
    armTimer(this.state);

    return result;
  }

  async update(id: string, patch: CronJobPatch) {
    const result = await ops.update(this.state, id, patch);

    // Explicitly re-arm timer after updating to ensure changes are reflected
    armTimer(this.state);

    return result;
  }

  async remove(id: string) {
    const result = await ops.remove(this.state, id);

    // Explicitly re-arm timer after removing to update scheduling
    armTimer(this.state);

    return result;
  }

  async run(id: string, forced = false) {
    return await ops.run(this.state, id, forced);
  }
}
