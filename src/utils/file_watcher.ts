import chokidar from "chokidar";

export type WatchOptions = {
  debounceMs?: number;
  awaitWriteFinish?: boolean | {
    stabilityThreshold?: number;
    pollInterval?: number;
  };
};

export type WatchHandle = {
  close: () => Promise<void>;
};

export const watchFile = (
  filePath: string,
  onChange: () => Promise<void> | void,
  onError?: (error: unknown) => void,
  options: WatchOptions = {}
): WatchHandle => {
  const debounceMs = options.debounceMs ?? 150;
  let timer: NodeJS.Timeout | undefined;

  const watcher = chokidar.watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: options.awaitWriteFinish === false ? false : {
      stabilityThreshold: options.awaitWriteFinish?.stabilityThreshold ?? 200,
      pollInterval: options.awaitWriteFinish?.pollInterval ?? 50
    }
  });

  const trigger = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(async () => {
      try {
        await onChange();
      } catch (error) {
        onError?.(error);
      }
    }, debounceMs);
  };

  watcher.on("change", trigger);
  watcher.on("add", trigger);
  watcher.on("error", (error) => onError?.(error));

  return {
    close: () => watcher.close()
  };
};
