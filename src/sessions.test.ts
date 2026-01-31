import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./config.js";

// Create mock instances
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockRename = vi.fn();
const mockRm = vi.fn();
const mockStat = vi.fn();
const mockSpawn = vi.fn();

vi.mock("node:fs/promises", () => ({
	readdir: (...args: unknown[]) => mockReaddir(...args),
	readFile: (...args: unknown[]) => mockReadFile(...args),
	rename: (...args: unknown[]) => mockRename(...args),
	rm: (...args: unknown[]) => mockRm(...args),
	stat: (...args: unknown[]) => mockStat(...args),
}));

vi.mock("node:child_process", () => ({
	spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Import after mocking
const {
	listSessions,
	archiveSession,
	deleteSession,
	cleanupOldSessions,
	formatSessionAge,
	formatFileSize,
	generateSessionTitle,
} = await import("./sessions.js");

describe("sessions", () => {
	const mockConfig: Config = {
		telegramToken: "test-token",
		workspace: "/mock/workspace",
		sessionDir: "/mock/sessions",
		thinkingLevel: "low",
		allowedUsers: [],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("listSessions", () => {
		it("should return empty array when directory does not exist", async () => {
			mockReaddir.mockRejectedValue(new Error("ENOENT"));
			const sessions = await listSessions(mockConfig);
			expect(sessions).toEqual([]);
		});

		it("should filter out non-jsonl files", async () => {
			mockReaddir.mockResolvedValue([
				"telegram-123.jsonl",
				"other.txt",
				"telegram-456.json",
				"readme.md",
			]);
			mockStat.mockResolvedValue({
				mtime: new Date("2024-01-15"),
				size: 1024,
			});

			const sessions = await listSessions(mockConfig);
			expect(sessions.length).toBe(1);
			expect(sessions[0].filename).toBe("telegram-123.jsonl");
		});

		it("should extract chat ID from filename", async () => {
			mockReaddir.mockResolvedValue(["telegram-12345.jsonl"]);
			mockStat.mockResolvedValue({
				mtime: new Date("2024-01-15"),
				size: 1024,
			});

			const sessions = await listSessions(mockConfig);
			expect(sessions[0].chatId).toBe("12345");
		});

		it("should handle negative chat IDs", async () => {
			mockReaddir.mockResolvedValue(["telegram--100123456789.jsonl"]);
			mockStat.mockResolvedValue({
				mtime: new Date("2024-01-15"),
				size: 1024,
			});

			const sessions = await listSessions(mockConfig);
			expect(sessions[0].chatId).toBe("-100123456789");
		});

		it("should return 'unknown' for malformed filenames", async () => {
			mockReaddir.mockResolvedValue(["malformed.jsonl"]);
			mockStat.mockResolvedValue({
				mtime: new Date("2024-01-15"),
				size: 1024,
			});

			const sessions = await listSessions(mockConfig);
			expect(sessions[0].chatId).toBe("unknown");
		});

		it("should sort sessions by modification date (newest first)", async () => {
			mockReaddir.mockResolvedValue([
				"telegram-1.jsonl",
				"telegram-2.jsonl",
				"telegram-3.jsonl",
			]);

			const dates = [
				new Date("2024-01-10"),
				new Date("2024-01-20"),
				new Date("2024-01-15"),
			];
			let callIndex = 0;
			mockStat.mockImplementation(() =>
				Promise.resolve({
					mtime: dates[callIndex++],
					size: 1024,
				}),
			);

			const sessions = await listSessions(mockConfig);
			expect(sessions[0].filename).toBe("telegram-2.jsonl"); // Jan 20
			expect(sessions[1].filename).toBe("telegram-3.jsonl"); // Jan 15
			expect(sessions[2].filename).toBe("telegram-1.jsonl"); // Jan 10
		});

		it("should include correct path for each session", async () => {
			mockReaddir.mockResolvedValue(["telegram-123.jsonl"]);
			mockStat.mockResolvedValue({
				mtime: new Date("2024-01-15"),
				size: 2048,
			});

			const sessions = await listSessions(mockConfig);
			expect(sessions[0].path).toBe("/mock/sessions/telegram-123.jsonl");
		});

		it("should include file size", async () => {
			mockReaddir.mockResolvedValue(["telegram-123.jsonl"]);
			mockStat.mockResolvedValue({
				mtime: new Date("2024-01-15"),
				size: 2048,
			});

			const sessions = await listSessions(mockConfig);
			expect(sessions[0].sizeBytes).toBe(2048);
		});

		it("should handle multiple valid sessions", async () => {
			mockReaddir.mockResolvedValue([
				"telegram-1.jsonl",
				"telegram-2.jsonl",
				"telegram-3.jsonl",
			]);
			mockStat.mockResolvedValue({
				mtime: new Date("2024-01-15"),
				size: 1024,
			});

			const sessions = await listSessions(mockConfig);
			expect(sessions.length).toBe(3);
		});
	});

	describe("generateSessionTitle", () => {
		function createMockProcess(): ChildProcess & EventEmitter {
			const proc = new EventEmitter() as ChildProcess & EventEmitter;
			proc.stdout = new EventEmitter() as ChildProcess["stdout"];
			proc.stderr = new EventEmitter() as ChildProcess["stderr"];
			proc.kill = vi.fn();
			return proc;
		}

		it("should return 'Empty session' when file has no user messages", async () => {
			mockReadFile.mockResolvedValue('{"role":"system","content":"test"}\n');

			const title = await generateSessionTitle("/path/to/session.jsonl");
			expect(title).toBe("Empty session");
		});

		it("should return 'Empty session' for empty file", async () => {
			mockReadFile.mockResolvedValue("");

			const title = await generateSessionTitle("/path/to/session.jsonl");
			expect(title).toBe("Empty session");
		});

		it("should call Pi with first user message", async () => {
			mockReadFile.mockResolvedValue(
				'{"role":"user","content":"Hello world test"}\n',
			);
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const titlePromise = generateSessionTitle("/path/to/session.jsonl");

			// Simulate Pi response
			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "Test Title");
			mockProc.emit("close", 0);

			const title = await titlePromise;
			expect(title).toBe("Test Title");
			expect(mockSpawn).toHaveBeenCalledWith(
				"pi",
				expect.arrayContaining(["--print", "--no-session"]),
				expect.any(Object),
			);
		});

		it("should handle user message as array content", async () => {
			mockReadFile.mockResolvedValue(
				'{"role":"user","content":[{"text":"Array message"}]}\n',
			);
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const titlePromise = generateSessionTitle("/path/to/session.jsonl");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "Array Title");
			mockProc.emit("close", 0);

			const title = await titlePromise;
			expect(title).toBe("Array Title");
		});

		it("should use fallback on Pi error", async () => {
			mockReadFile.mockResolvedValue(
				'{"role":"user","content":"First words"}\n',
			);
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const titlePromise = generateSessionTitle("/path/to/session.jsonl");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("error", new Error("spawn failed"));

			const title = await titlePromise;
			expect(title).toBe("First words");
		});

		it("should truncate long fallback titles", async () => {
			const longMessage = "a".repeat(100);
			mockReadFile.mockResolvedValue(
				`{"role":"user","content":"${longMessage}"}\n`,
			);
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const titlePromise = generateSessionTitle("/path/to/session.jsonl");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("error", new Error("spawn failed"));

			const title = await titlePromise;
			expect(title.length).toBeLessThanOrEqual(33); // 30 + "..."
		});

		it("should timeout after 10 seconds", async () => {
			mockReadFile.mockResolvedValue('{"role":"user","content":"Test"}\n');
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const titlePromise = generateSessionTitle("/path/to/session.jsonl");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

			// Advance time by 10 seconds
			vi.advanceTimersByTime(10000);

			const title = await titlePromise;
			expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
			expect(title).toBe("Test");
		});

		it("should handle file read error", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));

			const title = await generateSessionTitle("/path/to/session.jsonl");
			expect(title).toBe("Empty session");
		});

		it("should skip invalid JSON lines", async () => {
			mockReadFile.mockResolvedValue(
				'invalid json\n{"role":"user","content":"Valid"}\n',
			);
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const titlePromise = generateSessionTitle("/path/to/session.jsonl");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "Valid Title");
			mockProc.emit("close", 0);

			const title = await titlePromise;
			expect(title).toBe("Valid Title");
		});

		it("should return 'Untitled' when Pi returns empty string", async () => {
			mockReadFile.mockResolvedValue('{"role":"user","content":"Test"}\n');
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const titlePromise = generateSessionTitle("/path/to/session.jsonl");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "  ");
			mockProc.emit("close", 0);

			const title = await titlePromise;
			expect(title).toBe("Untitled");
		});
	});

	describe("archiveSession", () => {
		it("should return null when session does not exist", async () => {
			mockStat.mockRejectedValue(new Error("ENOENT"));

			const result = await archiveSession(mockConfig, 123);
			expect(result).toBeNull();
		});

		it("should rename session with timestamp", async () => {
			mockStat.mockResolvedValue({ size: 1024 });
			mockRename.mockResolvedValue(undefined);

			vi.setSystemTime(new Date("2024-01-15T12:30:45.678Z"));

			const result = await archiveSession(mockConfig, 123);

			expect(result).toBe("telegram-123-2024-01-15T12-30-45-678Z.jsonl");
			expect(mockRename).toHaveBeenCalledWith(
				"/mock/sessions/telegram-123.jsonl",
				"/mock/sessions/telegram-123-2024-01-15T12-30-45-678Z.jsonl",
			);
		});

		it("should handle negative chat IDs", async () => {
			mockStat.mockResolvedValue({ size: 1024 });
			mockRename.mockResolvedValue(undefined);

			vi.setSystemTime(new Date("2024-01-15T12:30:45.678Z"));

			const result = await archiveSession(mockConfig, -100123);

			expect(result).toBe("telegram--100123-2024-01-15T12-30-45-678Z.jsonl");
		});
	});

	describe("deleteSession", () => {
		it("should call rm with session path", async () => {
			mockRm.mockResolvedValue(undefined);

			await deleteSession("/path/to/session.jsonl");

			expect(mockRm).toHaveBeenCalledWith("/path/to/session.jsonl");
		});

		it("should propagate errors", async () => {
			mockRm.mockRejectedValue(new Error("Permission denied"));

			await expect(deleteSession("/path/to/session.jsonl")).rejects.toThrow(
				"Permission denied",
			);
		});
	});

	describe("cleanupOldSessions", () => {
		it("should keep newest sessions and delete old ones", async () => {
			const now = new Date("2024-01-20");
			vi.setSystemTime(now);

			mockReaddir.mockResolvedValue([
				"telegram-1-2024-01-01.jsonl",
				"telegram-1-2024-01-02.jsonl",
				"telegram-1-2024-01-03.jsonl",
				"telegram-1-2024-01-04.jsonl",
				"telegram-1-2024-01-05.jsonl",
				"telegram-1-2024-01-06.jsonl",
				"telegram-1-2024-01-07.jsonl",
			]);

			// Return dates in order of files
			const dates = [
				new Date("2024-01-01"),
				new Date("2024-01-02"),
				new Date("2024-01-03"),
				new Date("2024-01-04"),
				new Date("2024-01-05"),
				new Date("2024-01-06"),
				new Date("2024-01-07"),
			];
			let callIndex = 0;
			mockStat.mockImplementation(() =>
				Promise.resolve({
					mtime: dates[callIndex++],
					size: 1024,
				}),
			);
			mockRm.mockResolvedValue(undefined);

			const deleted = await cleanupOldSessions(mockConfig, 5);

			expect(deleted).toBe(2);
			expect(mockRm).toHaveBeenCalledTimes(2);
		});

		it("should delete nothing when fewer sessions than keepCount", async () => {
			mockReaddir.mockResolvedValue(["telegram-1.jsonl", "telegram-2.jsonl"]);
			mockStat.mockResolvedValue({
				mtime: new Date("2024-01-15"),
				size: 1024,
			});

			const deleted = await cleanupOldSessions(mockConfig, 5);

			expect(deleted).toBe(0);
			expect(mockRm).not.toHaveBeenCalled();
		});

		it("should handle cleanup per chat ID", async () => {
			// Note: Only telegram-<digits>.jsonl matches the pattern for extracting chatId
			// Files with timestamps like telegram-1-2024-01-01.jsonl have chatId = "unknown"
			mockReaddir.mockResolvedValue([
				"telegram-1.jsonl",
				"telegram-2.jsonl",
				"telegram-3.jsonl",
			]);

			const dates = [
				new Date("2024-01-01"),
				new Date("2024-01-02"),
				new Date("2024-01-03"),
			];
			let callIndex = 0;
			mockStat.mockImplementation(() =>
				Promise.resolve({
					mtime: dates[callIndex++],
					size: 1024,
				}),
			);
			mockRm.mockResolvedValue(undefined);

			// Each file has unique chatId, so with keepCount=1, should keep 1 each = 3 kept, 0 deleted
			const deleted = await cleanupOldSessions(mockConfig, 1);
			expect(deleted).toBe(0);
		});

		it("should ignore deletion errors", async () => {
			mockReaddir.mockResolvedValue([
				"telegram-1-a.jsonl",
				"telegram-1-b.jsonl",
				"telegram-1-c.jsonl",
			]);

			const dates = [
				new Date("2024-01-01"),
				new Date("2024-01-02"),
				new Date("2024-01-03"),
			];
			let callIndex = 0;
			mockStat.mockImplementation(() =>
				Promise.resolve({
					mtime: dates[callIndex++],
					size: 1024,
				}),
			);
			mockRm.mockRejectedValue(new Error("Permission denied"));

			// Should not throw
			const deleted = await cleanupOldSessions(mockConfig, 1);
			expect(deleted).toBe(0); // Failures don't count
		});

		it("should use default keepCount of 5", async () => {
			mockReaddir.mockResolvedValue([
				"telegram-1-1.jsonl",
				"telegram-1-2.jsonl",
				"telegram-1-3.jsonl",
				"telegram-1-4.jsonl",
				"telegram-1-5.jsonl",
				"telegram-1-6.jsonl",
				"telegram-1-7.jsonl",
			]);

			const dates = [1, 2, 3, 4, 5, 6, 7].map((d) => new Date(`2024-01-0${d}`));
			let callIndex = 0;
			mockStat.mockImplementation(() =>
				Promise.resolve({
					mtime: dates[callIndex++],
					size: 1024,
				}),
			);
			mockRm.mockResolvedValue(undefined);

			const deleted = await cleanupOldSessions(mockConfig);

			expect(deleted).toBe(2); // 7 - 5 = 2
		});
	});

	describe("formatSessionAge", () => {
		it("should return 'just now' for less than 1 minute", async () => {
			const now = new Date("2024-01-15T12:00:30Z");
			vi.setSystemTime(now);

			const date = new Date("2024-01-15T12:00:00Z");
			expect(formatSessionAge(date)).toBe("just now");
		});

		it("should return minutes for less than 1 hour", async () => {
			const now = new Date("2024-01-15T12:30:00Z");
			vi.setSystemTime(now);

			const date = new Date("2024-01-15T12:00:00Z");
			expect(formatSessionAge(date)).toBe("30m ago");
		});

		it("should return hours for less than 24 hours", async () => {
			const now = new Date("2024-01-15T18:00:00Z");
			vi.setSystemTime(now);

			const date = new Date("2024-01-15T12:00:00Z");
			expect(formatSessionAge(date)).toBe("6h ago");
		});

		it("should return days for less than 7 days", async () => {
			const now = new Date("2024-01-20T12:00:00Z");
			vi.setSystemTime(now);

			const date = new Date("2024-01-15T12:00:00Z");
			expect(formatSessionAge(date)).toBe("5d ago");
		});

		it("should return formatted date for 7+ days", async () => {
			const now = new Date("2024-01-30T12:00:00Z");
			vi.setSystemTime(now);

			const date = new Date("2024-01-15T12:00:00Z");
			const result = formatSessionAge(date);
			// Date format varies by locale, just check it's not a relative time
			expect(result).not.toContain("ago");
		});

		it("should handle edge case at exactly 1 minute", async () => {
			const now = new Date("2024-01-15T12:01:00Z");
			vi.setSystemTime(now);

			const date = new Date("2024-01-15T12:00:00Z");
			expect(formatSessionAge(date)).toBe("1m ago");
		});

		it("should handle edge case at exactly 1 hour", async () => {
			const now = new Date("2024-01-15T13:00:00Z");
			vi.setSystemTime(now);

			const date = new Date("2024-01-15T12:00:00Z");
			expect(formatSessionAge(date)).toBe("1h ago");
		});

		it("should handle edge case at exactly 1 day", async () => {
			const now = new Date("2024-01-16T12:00:00Z");
			vi.setSystemTime(now);

			const date = new Date("2024-01-15T12:00:00Z");
			expect(formatSessionAge(date)).toBe("1d ago");
		});
	});

	describe("formatFileSize", () => {
		it("should format bytes", () => {
			expect(formatFileSize(500)).toBe("500B");
		});

		it("should format kilobytes", () => {
			expect(formatFileSize(2048)).toBe("2.0KB");
		});

		it("should format megabytes", () => {
			expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0MB");
		});

		it("should handle exact KB boundary", () => {
			expect(formatFileSize(1024)).toBe("1.0KB");
		});

		it("should handle exact MB boundary", () => {
			expect(formatFileSize(1024 * 1024)).toBe("1.0MB");
		});

		it("should show one decimal place for KB", () => {
			expect(formatFileSize(1536)).toBe("1.5KB");
		});

		it("should show one decimal place for MB", () => {
			expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5MB");
		});

		it("should handle zero bytes", () => {
			expect(formatFileSize(0)).toBe("0B");
		});

		it("should handle 1023 bytes (just under 1KB)", () => {
			expect(formatFileSize(1023)).toBe("1023B");
		});
	});
});
