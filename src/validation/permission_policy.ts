import { z } from "zod";

const PolicyEntrySchema = z
  .object({
    priority: z.number().int(),
    name: z.string(),
    desc: z.string()
  })
  .strict();

export const PermissionPolicySchema = z
  .object({
    tools: z.array(PolicyEntrySchema).optional(),
    mcps: z.array(PolicyEntrySchema).optional(),
    commands: z.array(PolicyEntrySchema).optional(),
    skills: z.array(PolicyEntrySchema).optional(),
    resurces: z.array(PolicyEntrySchema).optional(),
    resources: z.array(PolicyEntrySchema).optional()
  })
  .strict();

export const validatePermissionPolicy = (input: unknown) =>
  PermissionPolicySchema.parse(input);
