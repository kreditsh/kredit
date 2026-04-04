import { z } from "zod";

export const OrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string().nullish(),
});
export type Org = z.infer<typeof OrgSchema>;

export const AgentStatusSchema = z.object({
  status: z.string(),
  score: z.number().int(),
  wallet_remaining: z.number().int(),
  rate_remaining: z.number().int(),
});
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  name: z.string(),
  status: z.string().nullish(),
  score: z.number().int().nullish(),
  created_at: z.string().nullish(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const CheckResultSchema = z.object({
  allow: z.boolean(),
  risk_level: z.string(),
  status: z.string(),
  txn_id: z.string().nullish(),
  agent: AgentStatusSchema.nullish(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const TransactionSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  action: z.string(),
  estimated_cost: z.number().int(),
  actual_cost: z.number().int().nullish(),
  outcome: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const WalletSchema = z.object({
  agent_id: z.string(),
  balance: z.number().int(),
  budget: z.number().int(),
  spent: z.number().int().nullish(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const ScoreResultSchema = z.object({
  agent_id: z.string(),
  score: z.number().int(),
  risk_level: z.string(),
  factors: z.array(z.string()).nullish(),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;
