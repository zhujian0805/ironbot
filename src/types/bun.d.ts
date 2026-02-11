declare module "bun:sqlite" {
  export class Database {
    constructor(filename?: string, options?: { create?: boolean; readwrite?: boolean });
    query(sql: string): Statement;
    close(): void;
    run(sql: string, ...params: any[]): { lastInsertRowid: number; changes: number };
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }

  export class Statement {
    run(...params: any[]): { lastInsertRowid: number; changes: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
    finalize(): void;
  }
}