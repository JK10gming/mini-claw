import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./config.js";

interface RunResult {
	output: string;
	error?: string;
}

// Simple lock per chat to prevent concurrent executions
const locks = new Map<number, Promise<void>>();

async function acquireLock(chatId: number): Promise<() => void> {
	while (locks.has(chatId)) {
		await locks.get(chatId);
	}
	let release: (() => void) | undefined;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	locks.set(chatId, promise);
	return () => {
		locks.delete(chatId);
		release?.();
	};
}

function getSessionPath(config: Config, chatId: number): string {
	return join(config.sessionDir, `telegram-${chatId}.jsonl`);
}

export async function runPi(
	config: Config,
	chatId: number,
	prompt: string,
	workspace: string,
): Promise<RunResult> {
	const release = await acquireLock(chatId);

	try {
		// Ensure session directory exists
		await mkdir(config.sessionDir, { recursive: true });

		const sessionPath = getSessionPath(config, chatId);

		const args = [
			"--session",
			sessionPath,
			"--print", // Non-interactive mode
			"--thinking",
			config.thinkingLevel,
			prompt,
		];

		return await new Promise<RunResult>((resolve) => {
			const proc = spawn("pi", args, {
				cwd: workspace,
				env: {
					...process.env,
					// Ensure pi uses the same auth
					PI_AGENT_DIR: join(process.env.HOME || "", ".pi", "agent"),
				},
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";

			proc.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			proc.stderr.on("data", (data) => {
				stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (code !== 0 && stderr) {
					resolve({ output: stdout || "Error occurred", error: stderr });
				} else {
					resolve({ output: stdout || "(no output)" });
				}
			});

			proc.on("error", (err) => {
				resolve({ output: "", error: `Failed to start Pi: ${err.message}` });
			});

			// Timeout
			setTimeout(() => {
				proc.kill("SIGTERM");
				resolve({ output: stdout || "", error: "Timeout: Pi took too long" });
			}, config.piTimeoutMs);
		});
	} finally {
		release();
	}
}

export async function checkPiAuth(): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("pi", ["--version"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		proc.on("close", (code) => {
			resolve(code === 0);
		});

		proc.on("error", () => {
			resolve(false);
		});
	});
}
