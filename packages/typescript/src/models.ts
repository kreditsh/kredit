import { z } from "zod";

export const OrgSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_at: z.string().nullish(),
});
export type Org = z.infer<typeof OrgSchema>;

export const RuleSchema = z.object({
	id: z.string().default(""),
	name: z.string().default(""),
	match: z.string().default("*"),
	max_cost_per_txn: z.number().default(0), // dollars, 0 = unlimited
	daily_spend_limit: z.number().default(0), // dollars, 0 = unlimited
	hourly_rate_limit: z.number().int().default(0), // calls per hour, 0 = unlimited
	enabled: z.boolean().default(true),
});
export type Rule = z.infer<typeof RuleSchema>;

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
	rules: z.array(RuleSchema).default([]),
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

export const ReportResultSchema = z.object({
	transaction_id: z.string(),
	outcome: z.string(),
	new_score: z.number().int(),
	agent_status: z.string(),
});
export type ReportResult = z.infer<typeof ReportResultSchema>;

export const TransactionSchema = z.object({
	id: z.string(),
	org_id: z.string(),
	agent_id: z.string(),
	type: z.string().default("api_call"),
	action: z.string(),
	status: z.string(),
	risk_level: z.string(),
	block_reason: z.string().nullish(),
	estimated_cost: z.number(),
	actual_cost: z.number().nullish(),
	outcome: z.string().nullish(),
	metadata: z.record(z.unknown()).nullish(),
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
	updated_at: z.string().nullish(),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;

export const AgentSpendSchema = z.object({
	agent_id: z.string(),
	total_spend: z.number(),
	daily_spend: z.number(),
	weekly_spend: z.number(),
	monthly_spend: z.number(),
});
export type AgentSpend = z.infer<typeof AgentSpendSchema>;

export const FleetOverviewSchema = z.object({
	total_agents: z.number().int(),
	active_agents: z.number().int(),
	throttled_agents: z.number().int(),
	frozen_agents: z.number().int(),
	total_balance: z.number(),
	total_budget: z.number(),
	avg_credit_score: z.number(),
	total_spend: z.number(),
	daily_spend: z.number(),
	weekly_spend: z.number(),
	monthly_spend: z.number(),
	risk_events_blocked: z.number().int(),
});
export type FleetOverview = z.infer<typeof FleetOverviewSchema>;

export const PolicySchema = z.object({
	id: z.string(),
	org_id: z.string(),
	scoring_weights: z.record(z.number()),
	updated_at: z.string().nullish(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const EventSchema = z.object({
	id: z.string(),
	type: z.string(),
	before: z.record(z.unknown()).nullish(),
	after: z.record(z.unknown()).nullish(),
	timestamp: z.string(),
});
export type Event = z.infer<typeof EventSchema>;
