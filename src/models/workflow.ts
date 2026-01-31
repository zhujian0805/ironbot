export type WorkflowStatus = "succeeded" | "failed";

export type Workflow = {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  status: WorkflowStatus;
};
