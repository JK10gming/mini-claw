import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
	telegramToken: string;
	workspace: string;
	sessionDir: string;
	thinkingLevel: "low" | "medium" | "high";
	allowedUsers: number[];
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

	return {
		telegramToken: token,
		workspace,
		sessionDir,
		thinkingLevel,
		allowedUsers,
	};
}
