import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { createBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { checkPiAuth } from "./pi-runner.js";

async function main() {
	console.log("Mini-Claw starting...");

	// Load configuration
	const config = loadConfig();
	console.log(`Workspace: ${config.workspace}`);
	console.log(`Session dir: ${config.sessionDir}`);

	// Ensure directories exist
	await mkdir(config.workspace, { recursive: true });
	await mkdir(config.sessionDir, { recursive: true });

	// Check Pi installation (fatal if not available)
	const piOk = await checkPiAuth();
	if (!piOk) {
		console.error("Error: Pi is not installed or not authenticated.");
		console.error("Run 'pi /login' to authenticate with an AI provider.");
		process.exit(1);
	}
	console.log("Pi: OK");

	// Create and start bot
	const bot = createBot(config);

	// Graceful shutdown
	const shutdown = () => {
		console.log("\nShutting down...");
		bot.stop();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	console.log("Bot starting...");
	await bot.start({
		onStart: (botInfo) => {
			console.log(`Bot @${botInfo.username} is running!`);
		},
	});
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
