import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "../utils/logging.jss";

interface FileOperation {
  id: string;
  type: "write" | "append" | "read";
  filePath: string;
  data?: any;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
  priority: "high" | "low";
}

export class AsyncFileManager {
  private operationQueue: FileOperation[] = [];
  private isProcessing = false;
  private writeBuffer = new Map<string, { data: string; timestamp: number }>();
  private bufferFlushInterval: NodeJS.Timeout | null = null;
  private readonly bufferFlushDelay = 1000; // 1 second
  private readonly maxBufferSize = 10; // Max operations to buffer before flush

  constructor() {
    this.startBufferFlushTimer();
  }

  /**
   * Queue a file write operation
   */
  async writeFile(filePath: string, data: string, priority: "high" | "low" = "low"): Promise<void> {
    return this.queueOperation({
      type: "write",
      filePath,
      data,
      priority
    });
  }

  /**
   * Queue a file append operation
   */
  async appendFile(filePath: string, data: string, priority: "high" | "low" = "low"): Promise<void> {
    return this.queueOperation({
      type: "append",
      filePath,
      data,
      priority
    });
  }

  /**
   * Queue a file read operation
   */
  async readFile(filePath: string, priority: "high" | "low" = "high"): Promise<string> {
    return this.queueOperation({
      type: "read",
      filePath,
      priority
    });
  }

  /**
   * Buffer a write operation for batching
   */
  bufferWrite(filePath: string, data: string): void {
    const existing = this.writeBuffer.get(filePath);
    if (existing) {
      // Append to existing buffer
      existing.data += data;
      existing.timestamp = Date.now();
    } else {
      this.writeBuffer.set(filePath, {
        data,
        timestamp: Date.now()
      });
    }

    // Flush if buffer is getting large
    if (this.writeBuffer.size >= this.maxBufferSize) {
      this.flushWriteBuffer();
    }
  }

  /**
   * Flush the write buffer to disk
   */
  private async flushWriteBuffer(): Promise<void> {
    if (this.writeBuffer.size === 0) {
      return;
    }

    const operations = Array.from(this.writeBuffer.entries());
    this.writeBuffer.clear();

    logger.debug({ operations: operations.length }, "Flushing write buffer");

    // Process all buffered writes in parallel
    const promises = operations.map(async ([filePath, buffer]) => {
      try {
        await this.ensureDirectoryExists(path.dirname(filePath));
        await fs.appendFile(filePath, buffer.data, "utf8");
      } catch (error) {
        logger.error({ error: (error as Error).message, filePath }, "Failed to flush buffered write");
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Queue an operation and return a promise
   */
  private queueOperation<T>(operation: Omit<FileOperation, "id" | "resolve" | "reject" | "timestamp">): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queuedOp: FileOperation = {
        ...operation,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.operationQueue.push(queuedOp);

      // Sort by priority (high priority first)
      this.operationQueue.sort((a, b) => {
        if (a.priority === b.priority) {
          return a.timestamp - b.timestamp; // FIFO within priority
        }
        return a.priority === "high" ? -1 : 1;
      });

      logger.debug({
        id: queuedOp.id,
        type: operation.type,
        filePath: operation.filePath,
        priority: operation.priority,
        queueLength: this.operationQueue.length
      }, "File operation queued");

      this.processQueue();
    });
  }

  /**
   * Process the operation queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift()!;

      try {
        logger.debug({ id: operation.id, type: operation.type }, "Processing file operation");

        let result: any;

        switch (operation.type) {
          case "write":
            await this.ensureDirectoryExists(path.dirname(operation.filePath));
            await fs.writeFile(operation.filePath, operation.data!, "utf8");
            break;

          case "append":
            await this.ensureDirectoryExists(path.dirname(operation.filePath));
            await fs.appendFile(operation.filePath, operation.data!, "utf8");
            break;

          case "read":
            result = await fs.readFile(operation.filePath, "utf8");
            break;
        }

        operation.resolve(result);
      } catch (error) {
        logger.error({
          error: (error as Error).message,
          id: operation.id,
          type: operation.type,
          filePath: operation.filePath
        }, "File operation failed");

        operation.reject(error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Ensure directory exists for file operations
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Start the buffer flush timer
   */
  private startBufferFlushTimer(): void {
    this.bufferFlushInterval = setInterval(() => {
      this.flushWriteBuffer();
    }, this.bufferFlushDelay);
  }

  /**
   * Stop the buffer flush timer
   */
  private stopBufferFlushTimer(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    queuedOperations: number;
    bufferedWrites: number;
    isProcessing: boolean;
  } {
    return {
      queuedOperations: this.operationQueue.length,
      bufferedWrites: this.writeBuffer.size,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Shutdown the file manager
   */
  async shutdown(): Promise<void> {
    this.stopBufferFlushTimer();
    await this.flushWriteBuffer();

    // Reject all pending operations
    for (const operation of this.operationQueue) {
      operation.reject(new Error("File manager shutting down"));
    }
    this.operationQueue.length = 0;

    logger.info("Async file manager shutdown complete");
  }
}