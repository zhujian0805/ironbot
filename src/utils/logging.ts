import pino from "pino";

export type LoggingOptions = {
  debug?: boolean;
  logLevel?: string;
  logFile?: string;
};

const resolveLevel = (options: LoggingOptions): string => {
  if (options.logLevel) {
    return options.logLevel.toLowerCase();
  }
  return options.debug ? "debug" : "info";
};

const createLogger = (options: LoggingOptions): pino.Logger => {
  const level = resolveLevel(options);
  const destination = options.logFile
    ? pino.destination({ dest: options.logFile, sync: false })
    : undefined;

  return pino(
    {
      level,
      timestamp: pino.stdTimeFunctions.isoTime
    },
    destination
  );
};

export let logger = createLogger({});

export const setupLogging = (options: LoggingOptions = {}): pino.Logger => {
  logger = createLogger(options);
  return logger;
};
