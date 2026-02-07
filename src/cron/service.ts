import type { CronJobCreate, CronJobPatch } from "./types.ts";
import * as ops from "./service/ops.ts";
import { createCronServiceState, type CronServiceDeps } from "./service/state.ts";

export class CronService {
  private readonly state;

  constructor(deps: CronServiceDeps) {
    this.state = createCronServiceState(deps);
  }

  async start() {
    await ops.start(this.state);
  }

  stop() {
    ops.stop(this.state);
  }

  async status() {
    return await ops.status(this.state);
  }

  async list() {
    return await ops.list(this.state);
  }

  async add(input: CronJobCreate) {
    return await ops.add(this.state, input);
  }

  async update(id: string, patch: CronJobPatch) {
    return await ops.update(this.state, id, patch);
  }

  async remove(id: string) {
    return await ops.remove(this.state, id);
  }

  async run(id: string, forced = false) {
    return await ops.run(this.state, id, forced);
  }
}
