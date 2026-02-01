// Type declarations for bun:sqlite
declare module "bun:sqlite" {
  export class Database {
    constructor(filename?: string, options?: { readonly?: boolean; create?: boolean; readwrite?: boolean });
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
    run(sql: string, ...params: any[]): RunResult;
    get<T = any>(sql: string, ...params: any[]): T | undefined;
    all<T = any>(sql: string, ...params: any[]): T[];
    transaction<T>(fn: () => T): T;
    pragma(sql: string): any;
  }

  export interface Statement {
    run(...params: any[]): RunResult;
    get<T = any>(...params: any[]): T | undefined;
    all<T = any>(...params: any[]): T[];
    finalize(): void;
  }

  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }
}