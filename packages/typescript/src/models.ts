import { z } from "zod";

export const OrgSchema = z.object({
	id: z.string(),
	name: z.string(),
	mode: z.string().default(""),
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
	sandbox_id: z.string().nullish(),
	name: z.string(),
	status: z.string(),
	mode: z.string().default(""),
	priority: z.string().default("normal"),
	wallet: WalletSchema,
	budgets: z.record(z.string(), z.unknown()).nullish(),
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
	mode: z.string().default(""),
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

export const GaussianSchema = z.object({
	mean: z.number().default(0),
	variance: z.number().default(0),
});
export type Gaussian = z.infer<typeof GaussianSchema>;

export const SeasonalitySchema = z.object({
	dow: z.array(z.number()).default([]), // Mon..Sun multipliers (7)
	hour: z.array(z.number()).default([]), // 0..23 multipliers (24)
});
export type Seasonality = z.infer<typeof SeasonalitySchema>;

export const WorkflowNodeSchema = z.object({
	id: z.string(),
	type: z.string(), // agent | llm | api | tool | payment
	label: z.string().default(""),
	integration: z.string().default(""),
	config: z.record(z.string(), z.unknown()).default({}),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
	from: z.string(),
	to: z.string(),
	condition: z.string().nullish(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowSchema = z.object({
	id: z.string(),
	sandbox_id: z.string(),
	mode: z.string().default(""),
	name: z.string().default(""),
	nodes: z.array(WorkflowNodeSchema).default([]),
	edges: z.array(WorkflowEdgeSchema).default([]),
	version: z.number().int().default(1),
	created_at: z.string().nullish(),
	updated_at: z.string().nullish(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const EnvironmentSchema = z.object({
	id: z.string(),
	sandbox_id: z.string(),
	user_id: z.string().default(""),
	kind: z.string(), // simulation | development | preview | production | simulation-run
	name: z.string().default(""),
	simulation_id: z.string().nullish(),
	parent_environment_id: z.string().nullish(),
	active: z.boolean().default(true),
	created_at: z.string().nullish(),
	updated_at: z.string().nullish(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ChatComponentSchema = z.object({
	type: z.string(),
	ref_id: z.string().nullish(),
	title: z.string().default(""),
	data: z.record(z.string(), z.unknown()).nullish(),
});
export type ChatComponent = z.infer<typeof ChatComponentSchema>;

export const MessageSchema = z.object({
	id: z.string(),
	chat_id: z.string(),
	role: z.string(),
	content: z.string().default(""),
	tool_calls: z.array(z.record(z.string(), z.unknown())).default([]),
	components: z.array(ChatComponentSchema).default([]),
	created_at: z.string().nullish(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ChatSchema = z.object({
	id: z.string(),
	sandbox_id: z.string().nullish(),
	mode: z.string().default(""),
	simulation_id: z.string().nullish(),
	title: z.string().default(""),
	messages: z.array(MessageSchema).default([]),
	created_at: z.string().nullish(),
	updated_at: z.string().nullish(),
});
export type Chat = z.infer<typeof ChatSchema>;

export const PriorSchema = z.object({
	id: z.string(),
	sandbox_id: z.string(),
	mode: z.string().default(""),
	name: z.string().default(""),
	workflow_id: z.string().default(""),
	frequency: GaussianSchema,
	cost: GaussianSchema,
	transitions: z.record(z.string(), z.number()).default({}),
	seasonality: SeasonalitySchema,
	source: z.string().default("manual"),
	created_at: z.string().nullish(),
	updated_at: z.string().nullish(),
});
export type Prior = z.infer<typeof PriorSchema>;
