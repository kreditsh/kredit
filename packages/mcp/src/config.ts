const DEFAULT_API_URL = "https://api.kredit.sh";

export interface Config {
	apiKey: string;
	apiUrl: string;
}

/**
 * Parse --api-key=VALUE and --api-url=VALUE from argv.
 */
function parseCLIFlags(argv: string[]): { apiKey?: string; apiUrl?: string } {
	let apiKey: string | undefined;
	let apiUrl: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		if (arg.startsWith("--api-key=")) {
			apiKey = arg.slice("--api-key=".length);
		} else if (arg === "--api-key" && i + 1 < argv.length) {
			apiKey = argv[++i];
		}

		if (arg.startsWith("--api-url=")) {
			apiUrl = arg.slice("--api-url=".length);
		} else if (arg === "--api-url" && i + 1 < argv.length) {
			apiUrl = argv[++i];
		}
	}

	return { apiKey, apiUrl };
}

/**
 * Resolve configuration from env + CLI flags.
 * CLI flags take precedence over env vars.
 */
export function resolveConfig(argv: string[] = process.argv): Config {
	const flags = parseCLIFlags(argv);

	const apiKey = flags.apiKey || process.env.KREDIT_API_KEY || "";
	const apiUrl = flags.apiUrl || process.env.KREDIT_API_URL || DEFAULT_API_URL;

	return { apiKey, apiUrl };
}
