import { z } from "zod";

export const OrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string().nullish(),
});
export type Org = z.infer<typeof OrgSchema>;

export const ApiLimitSchema = z.object({
  max_cost_per_txn: z.number().default(0),
  daily_spend_limit: z.number().default(0),
  hourly_rate_limit: z.number().int().default(0),
});
export type ApiLimit = z.infer<typeof ApiLimitSchema>;

export const WalletSchema = z.object({
  balance: z.number(),
  budget: z.number(),
  max_per_txn: z.number().default(0),
  daily_spend_limit: z.number().default(0),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const CreditSchema = z.object({
  score: z.number().int(),
  task_success_rate: z.number(),
  cost_efficiency: z.number(),
  violation_count: z.number().int(),
  total_tasks: z.number().int(),
  updated_at: z.string().nullish(),
});
export type Credit = z.infer<typeof CreditSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  name: z.string(),
  status: z.string(),
  priority: z.string().default("normal"),
  wallet: WalletSchema,
  credit: CreditSchema,
  api_limits: z.record(ApiLimitSchema).default({}),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const CheckResultSchema = z.object({
  transaction_id: z.string(),
  status: z.string(),
  risk_level: z.string(),
  block_reason: z.string().nullish(),
  agent_status: z.string().nullish(),
  wallet_balance: z.number().nullish(),
  credit_score: z.number().int().nullish(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const TransactionSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  action: z.string(),
  estimated_cost: z.number(),
  actual_cost: z.number().nullish(),
  outcome: z.string().nullish(),
  timestamp: z.string().nullish(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const ScoreResultSchema = z.object({
  agent_id: z.string(),
  score: z.number().int(),
  task_success_rate: z.number().nullish(),
  cost_efficiency: z.number().nullish(),
  violation_count: z.number().int().nullish(),
  total_tasks: z.number().int().nullish(),
  status: z.string().nullish(),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;
