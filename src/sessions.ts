import { spawn } from "node:child_process";
import { readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./config.js";

export interface SessionInfo {
	filename: string;
	chatId: string;
	path: string;
	modifiedAt: Date;
	sizeBytes: number;
	title?: string;
}

export async function listSessions(config: Config): Promise<SessionInfo[]> {
	const sessions: SessionInfo[] = [];

	try {
		const files = await readdir(config.sessionDir);

		for (const file of files) {
			if (!file.endsWith(".jsonl")) continue;

			const filePath = join(config.sessionDir, file);
			const stats = await stat(filePath);

			// Extract chat ID from filename: telegram-<chatId>.jsonl
			const match = file.match(/^telegram-(-?\d+)\.jsonl$/);
			const chatId = match?.[1] || "unknown";

			sessions.push({
				filename: file,
				chatId,
				path: filePath,
				modifiedAt: stats.mtime,
				sizeBytes: stats.size,
			});
		}

		// Sort by modified date, newest first
		sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
	} catch {
		// Directory might not exist yet
	}

	return sessions;
}

async function getFirstUserMessage(
	sessionPath: string,
): Promise<string | null> {
	try {
		const content = await readFile(sessionPath, "utf-8");
		const lines = content.split("\n").filter((l) => l.trim());

		for (const line of lines) {
			try {
				const entry = JSON.parse(line);
				// Look for user message
				if (entry.role === "user" && entry.content) {
					const text =
						typeof entry.content === "string"
							? entry.content
							: entry.content[0]?.text || "";
					if (text.trim()) {
						return text.slice(0, 500); // Limit to 500 chars
					}
				}
			} catch {
				// Skip invalid JSON lines
			}
		}
	} catch {
		// File read error
	}
	return null;
}

export async function generateSessionTitle(
	sessionPath: string,
): Promise<string> {
	const firstMessage = await getFirstUserMessage(sessionPath);
	if (!firstMessage) {
		return "Empty session";
	}

	// Use Pi to generate a short title
	return new Promise((resolve) => {
		const prompt = `Generate a very short title (max 5 words) for a conversation that started with: "${firstMessage.slice(0, 200)}". Reply with ONLY the title, no quotes, no explanation.`;

		const proc = spawn("pi", ["--print", "--no-session", prompt], {
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});

		let stdout = "";
		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		proc.on("close", () => {
			const title = stdout.trim().slice(0, 50) || "Untitled";
			resolve(title);
		});

		proc.on("error", () => {
			// Fallback: use first few words of message
			const words = firstMessage.split(/\s+/).slice(0, 5).join(" ");
			resolve(words.length > 30 ? `${words.slice(0, 30)}...` : words);
		});

		// Timeout after 10 seconds
		setTimeout(() => {
			proc.kill("SIGTERM");
			const words = firstMessage.split(/\s+/).slice(0, 5).join(" ");
			resolve(words.length > 30 ? `${words.slice(0, 30)}...` : words);
		}, 10000);
	});
}

export async function archiveSession(
	config: Config,
	chatId: number,
): Promise<string | null> {
	const currentPath = join(config.sessionDir, `telegram-${chatId}.jsonl`);

	try {
		await stat(currentPath);
	} catch {
		return null; // No current session
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const archiveName = `telegram-${chatId}-${timestamp}.jsonl`;
	const archivePath = join(config.sessionDir, archiveName);

	await rename(currentPath, archivePath);
	return archiveName;
}

export async function deleteSession(sessionPath: string): Promise<void> {
	await rm(sessionPath);
}

export async function cleanupOldSessions(
	config: Config,
	keepCount: number = 5,
): Promise<number> {
	const sessions = await listSessions(config);

	// Group by chatId
	const byChatId = new Map<string, SessionInfo[]>();
	for (const session of sessions) {
		const list = byChatId.get(session.chatId) || [];
		list.push(session);
		byChatId.set(session.chatId, list);
	}

	let deletedCount = 0;

	// For each chat, keep only the newest `keepCount` sessions
	for (const [, chatSessions] of byChatId) {
		// Already sorted by date (newest first)
		const toDelete = chatSessions.slice(keepCount);
		for (const session of toDelete) {
			try {
				await deleteSession(session.path);
				deletedCount++;
			} catch {
				// Ignore deletion errors
			}
		}
	}

	return deletedCount;
}

export function formatSessionAge(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
