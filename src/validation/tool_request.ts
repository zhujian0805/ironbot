import { z } from "zod";

export const ToolRequestSchema = z
  .object({
    toolName: z.string(),
    arguments: z.record(z.unknown()),
    requestedResource: z.string().optional(),
    decision: z.enum(["allowed", "denied"]).optional(),
    reason: z.string().optional()
  })
  .strict();

export const validateToolRequest = (input: unknown) => ToolRequestSchema.parse(input);
