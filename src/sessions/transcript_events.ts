import { EventEmitter } from "node:events";
import type { TranscriptMessage } from "./types.js";

export type TranscriptAppendEvent = {
  sessionKey: string;
  sessionId: string;
  sessionFile: string;
  message: TranscriptMessage;
};

const emitter = new EventEmitter();

export const onTranscriptAppended = (listener: (event: TranscriptAppendEvent) => void): (() => void) => {
  emitter.on("append", listener);
  return () => emitter.off("append", listener);
};

export const emitTranscriptAppended = (event: TranscriptAppendEvent): void => {
  emitter.emit("append", event);
};
