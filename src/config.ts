import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
	telegramToken: string;
	workspace: string;
	sessionDir: string;
	thinkingLevel: "low" | "medium" | "high";
	allowedUsers: number[];
	// Rate limiting
	rateLimitCooldownMs: number;
	// Timeouts
	piTimeoutMs: number;
	shellTimeoutMs: number;
	sessionTitleTimeoutMs: number;
}

export function loadConfig(): Config {
	const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
	if (!token) {
		throw new Error("TELEGRAM_BOT_TOKEN is required. Set it in .env file.");
	}

	const home = homedir();

	const workspace =
		process.env.MINI_CLAW_WORKSPACE?.trim() ||
		join(home, "mini-claw-workspace");

	const sessionDir =
		process.env.MINI_CLAW_SESSION_DIR?.trim() ||
		join(home, ".mini-claw", "sessions");

	const thinkingLevel = (process.env.PI_THINKING_LEVEL?.trim() || "low") as
		| "low"
		| "medium"
		| "high";

	const allowedUsers = process.env.ALLOWED_USERS?.trim()
		? process.env.ALLOWED_USERS.split(",")
				.map((id) => parseInt(id.trim(), 10))
				.filter((id) => !Number.isNaN(id))
		: [];

	// Rate limiting: default 5 seconds cooldown
	const rateLimitCooldownMs = parseInt(
		process.env.RATE_LIMIT_COOLDOWN_MS || "5000",
		10,
	);

	// Timeouts: defaults are Pi=5min, Shell=60s, SessionTitle=10s
	const piTimeoutMs = parseInt(
		process.env.PI_TIMEOUT_MS || String(5 * 60 * 1000),
		10,
	);
	const shellTimeoutMs = parseInt(process.env.SHELL_TIMEOUT_MS || "60000", 10);
	const sessionTitleTimeoutMs = parseInt(
		process.env.SESSION_TITLE_TIMEOUT_MS || "10000",
		10,
	);

	return {
		telegramToken: token,
		workspace,
		sessionDir,
		thinkingLevel,
		allowedUsers,
		rateLimitCooldownMs,
		piTimeoutMs,
		shellTimeoutMs,
		sessionTitleTimeoutMs,
	};
}
