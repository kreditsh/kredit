import type { KreditAPI } from "./api.js";

export interface SimulationOptions {
	orgName?: string;
	agents?: number;
	actionsPerAgent?: number;
}

type Priority = "normal" | "high" | "critical";

interface Archetype {
	name: string;
	priority: Priority;
	wallet: {
		balance: number;
		budget: number;
		max_per_txn: number;
		daily_spend_limit: number;
	};
	rules: Array<{
		name: string;
		match: string;
		max_cost_per_txn?: number;
		daily_spend_limit?: number;
		hourly_rate_limit?: number;
	}>;
}

// A small fleet designed to produce a realistic mix of allow / block / flag.
const ARCHETYPES: Archetype[] = [
	{
		name: "payouts",
		priority: "critical",
		wallet: {
			balance: 5000,
			budget: 10000,
			max_per_txn: 500,
			daily_spend_limit: 3000,
		},
		rules: [
			{
				name: "Settlements",
				match: "payment.*",
				max_cost_per_txn: 500,
				daily_spend_limit: 3000,
				hourly_rate_limit: 50,
			},
		],
	},
	{
		name: "content",
		priority: "normal",
		wallet: {
			balance: 800,
			budget: 1500,
			max_per_txn: 50,
			daily_spend_limit: 400,
		},
		rules: [
			{
				name: "Model calls",
				match: "api.*",
				max_cost_per_txn: 20,
				daily_spend_limit: 400,
				hourly_rate_limit: 200,
			},
		],
	},
	{
		name: "research",
		priority: "normal",
		wallet: {
			balance: 300,
			budget: 600,
			max_per_txn: 10,
			daily_spend_limit: 120,
		},
		rules: [
			{
				name: "Tools",
				match: "tool.*",
				max_cost_per_txn: 5,
				daily_spend_limit: 120,
				hourly_rate_limit: 120,
			},
		],
	},
	{
		name: "ops",
		priority: "high",
		wallet: {
			balance: 1200,
			budget: 2000,
			max_per_txn: 100,
			daily_spend_limit: 800,
		},
		rules: [
			{
				name: "Catch-all",
				match: "*",
				max_cost_per_txn: 100,
				daily_spend_limit: 800,
				hourly_rate_limit: 100,
			},
		],
	},
];

type TxType = "api_call" | "compute" | "data" | "tool" | "other";

interface ActionSpec {
	action: string;
	type: TxType;
	min: number;
	max: number;
}

// Cost ranges are deliberately wide so some calls breach per-txn caps / balances.
const ACTIONS: ActionSpec[] = [
	{ action: "payment.stripe.charge", type: "tool", min: 5, max: 120 },
	{ action: "payment.stripe.payout", type: "tool", min: 100, max: 900 },
	{ action: "api.anthropic.generate", type: "api_call", min: 0.5, max: 40 },
	{ action: "tool.browser.browse", type: "tool", min: 0, max: 3 },
	{ action: "tool.snowflake.query", type: "data", min: 1, max: 15 },
];

const clamp = (n: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, n));
const rand = (lo: number, hi: number) =>
	Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

interface AgentResult {
	name: string;
	agent_id: string;
	allowed: number;
	blocked: number;
	flagged: number;
	spent: number;
	final_balance: number | null;
	credit_score: number | null;
}

/**
 * Run a compact, synchronous Kredit simulation: stand up a throwaway org with a
 * small fleet, fire a batch of risk checks across varied actions/costs, and
 * return a summary of the trust decisions. Creates real data — clean up with
 * kredit_delete_org.
 */
export async function runSimulation(
	api: KreditAPI,
	opts: SimulationOptions = {},
) {
	const agentCount = clamp(Math.floor(opts.agents ?? 4), 1, 10);
	const perAgent = clamp(Math.floor(opts.actionsPerAgent ?? 5), 1, 20);
	const orgName =
		opts.orgName ??
		`simulation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`;

	const totals = { allowed: 0, blocked: 0, flagged: 0 };
	let totalSpend = 0;
	const perAgentResults: AgentResult[] = [];

	for (let i = 0; i < agentCount; i++) {
		const arch = ARCHETYPES[i % ARCHETYPES.length];
		const name =
			agentCount > ARCHETYPES.length ? `${arch.name}-${i + 1}` : arch.name;

		const created = await api.createAgent({
			org_name: orgName,
			name,
			priority: arch.priority,
			wallet: arch.wallet,
			rules: arch.rules,
		});
		const agentId: string = created.agent_id ?? created.id ?? created._id;

		const res: AgentResult = {
			name,
			agent_id: agentId,
			allowed: 0,
			blocked: 0,
			flagged: 0,
			spent: 0,
			final_balance: null,
			credit_score: null,
		};

		for (let k = 0; k < perAgent; k++) {
			const spec = pick(ACTIONS);
			const cost = rand(spec.min, spec.max);
			const decision = await api.check({
				agent_id: agentId,
				action: spec.action,
				estimated_cost: cost,
				type: spec.type,
				metadata: { source: "simulation" },
			});

			const status: string = decision.status;
			if (status === "allowed") {
				res.allowed++;
				res.spent += cost;
				totalSpend += cost;
			} else if (status === "flagged") {
				res.flagged++;
			} else {
				res.blocked++;
			}
			if (typeof decision.wallet_balance === "number")
				res.final_balance = decision.wallet_balance;
			if (typeof decision.credit_score === "number")
				res.credit_score = decision.credit_score;
		}

		res.spent = Math.round(res.spent * 100) / 100;
		totals.allowed += res.allowed;
		totals.blocked += res.blocked;
		totals.flagged += res.flagged;
		perAgentResults.push(res);
	}

	return {
		org_name: orgName,
		agents: agentCount,
		actions: agentCount * perAgent,
		decisions: totals,
		total_estimated_spend: Math.round(totalSpend * 100) / 100,
		per_agent: perAgentResults,
		dashboard_url: "https://kredit.sh/dashboard/spend",
		note: `Simulation created real agents and transactions under org "${orgName}". Remove them with kredit_delete_org.`,
	};
}
