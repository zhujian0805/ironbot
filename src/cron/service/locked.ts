import type { CronServiceState } from "./state.ts";

const storeLocks = new Map<string, Promise<void>>();

const resolveChain = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    () => undefined,
  );

export async function locked<T>(state: CronServiceState, fn: () => Promise<T>): Promise<T> {
  const storePath = state.deps.storePath;
  const storeOp = storeLocks.get(storePath) ?? Promise.resolve();
  state.deps.log.debug({ storePath }, "cron: waiting for store lock");
  const next = Promise.all([resolveChain(state.op), resolveChain(storeOp)]).then(() => {
    state.deps.log.debug({ storePath }, "cron: acquired store lock");
    return fn();
  }).finally(() => {
    state.deps.log.debug({ storePath }, "cron: releasing store lock");
  });

  const keepAlive = resolveChain(next);
  state.op = keepAlive;
  storeLocks.set(storePath, keepAlive);

  return (await next) as T;
}
