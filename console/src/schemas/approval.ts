import { z } from "zod";

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"], { message: "Decision is required" }),
  reason: z.string().optional(),
});

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
