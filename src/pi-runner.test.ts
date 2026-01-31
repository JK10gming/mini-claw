import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./config.js";

// Create mock instances
const mockMkdir = vi.fn();
const mockSpawn = vi.fn();

vi.mock("node:fs/promises", () => ({
	mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

vi.mock("node:child_process", () => ({
	spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Import after mocking
const { runPi, checkPiAuth } = await import("./pi-runner.js");

describe("pi-runner", () => {
	const mockConfig: Config = {
		telegramToken: "test-token",
		workspace: "/mock/workspace",
		sessionDir: "/mock/sessions",
		thinkingLevel: "low",
		allowedUsers: [],
	};

	function createMockProcess(): ChildProcess & EventEmitter {
		const proc = new EventEmitter() as ChildProcess & EventEmitter;
		proc.stdout = new EventEmitter() as ChildProcess["stdout"];
		proc.stderr = new EventEmitter() as ChildProcess["stderr"];
		proc.kill = vi.fn();
		return proc;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockMkdir.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("runPi", () => {
		it("should create session directory if it doesn't exist", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(mockConfig, 123, "hello", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "response");
			mockProc.emit("close", 0);

			await resultPromise;

			expect(mockMkdir).toHaveBeenCalledWith("/mock/sessions", {
				recursive: true,
			});
		});

		it("should spawn pi with correct arguments", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(mockConfig, 123, "test prompt", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "response");
			mockProc.emit("close", 0);

			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				"pi",
				[
					"--session",
					"/mock/sessions/telegram-123.jsonl",
					"--print",
					"--thinking",
					"low",
					"test prompt",
				],
				expect.objectContaining({
					cwd: "/workspace",
					stdio: ["ignore", "pipe", "pipe"],
				}),
			);
		});

		it("should use configured thinking level", async () => {
			const highConfig = { ...mockConfig, thinkingLevel: "high" as const };
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(highConfig, 123, "test", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "response");
			mockProc.emit("close", 0);

			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				"pi",
				expect.arrayContaining(["--thinking", "high"]),
				expect.any(Object),
			);
		});

		it("should return stdout as output", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(mockConfig, 123, "test", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "Hello ");
			mockProc.stdout?.emit("data", "World");
			mockProc.emit("close", 0);

			const result = await resultPromise;

			expect(result.output).toBe("Hello World");
			expect(result.error).toBeUndefined();
		});

		it("should return stderr as error on non-zero exit", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(mockConfig, 123, "test", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stderr?.emit("data", "error message");
			mockProc.emit("close", 1);

			const result = await resultPromise;

			expect(result.output).toBe("Error occurred");
			expect(result.error).toBe("error message");
		});

		it("should return (no output) when stdout is empty", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(mockConfig, 123, "test", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("close", 0);

			const result = await resultPromise;

			expect(result.output).toBe("(no output)");
		});

		it("should handle spawn error", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(mockConfig, 123, "test", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("error", new Error("spawn ENOENT"));

			const result = await resultPromise;

			expect(result.output).toBe("");
			expect(result.error).toBe("Failed to start Pi: spawn ENOENT");
		});

		it("should timeout after 5 minutes", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(mockConfig, 123, "test", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.stdout?.emit("data", "partial output");

			// Advance time by 5 minutes
			vi.advanceTimersByTime(5 * 60 * 1000);

			const result = await resultPromise;

			expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
			expect(result.output).toBe("partial output");
			expect(result.error).toBe("Timeout: Pi took too long");
		});

		it("should serialize concurrent calls for same chatId", async () => {
			const mockProc1 = createMockProcess();
			const mockProc2 = createMockProcess();
			let callCount = 0;
			mockSpawn.mockImplementation(() => {
				callCount++;
				return callCount === 1 ? mockProc1 : mockProc2;
			});

			const result1Promise = runPi(mockConfig, 123, "first", "/workspace");
			const result2Promise = runPi(mockConfig, 123, "second", "/workspace");

			// First call should start immediately
			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));

			// Complete first call
			mockProc1.stdout?.emit("data", "first response");
			mockProc1.emit("close", 0);

			// Second call should start after first completes
			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));

			mockProc2.stdout?.emit("data", "second response");
			mockProc2.emit("close", 0);

			const [result1, result2] = await Promise.all([
				result1Promise,
				result2Promise,
			]);

			expect(result1.output).toBe("first response");
			expect(result2.output).toBe("second response");
		});

		it("should allow parallel calls for different chatIds", async () => {
			const mockProc1 = createMockProcess();
			const mockProc2 = createMockProcess();
			let callCount = 0;
			mockSpawn.mockImplementation(() => {
				callCount++;
				return callCount === 1 ? mockProc1 : mockProc2;
			});

			const result1Promise = runPi(mockConfig, 123, "first", "/workspace");
			const result2Promise = runPi(mockConfig, 456, "second", "/workspace");

			// Both should start immediately
			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));

			mockProc1.stdout?.emit("data", "response 1");
			mockProc2.stdout?.emit("data", "response 2");
			mockProc1.emit("close", 0);
			mockProc2.emit("close", 0);

			const [result1, result2] = await Promise.all([
				result1Promise,
				result2Promise,
			]);

			expect(result1.output).toBe("response 1");
			expect(result2.output).toBe("response 2");
		});

		it("should release lock even on error", async () => {
			const mockProc1 = createMockProcess();
			const mockProc2 = createMockProcess();
			let callCount = 0;
			mockSpawn.mockImplementation(() => {
				callCount++;
				return callCount === 1 ? mockProc1 : mockProc2;
			});

			const result1Promise = runPi(mockConfig, 123, "first", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));

			// First call fails
			mockProc1.emit("error", new Error("crash"));

			await result1Promise;

			// Second call should still work
			const result2Promise = runPi(mockConfig, 123, "second", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));

			mockProc2.stdout?.emit("data", "success");
			mockProc2.emit("close", 0);

			const result2 = await result2Promise;
			expect(result2.output).toBe("success");
		});

		it("should include PI_AGENT_DIR in environment", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const originalHome = process.env.HOME;
			process.env.HOME = "/test/home";

			const resultPromise = runPi(mockConfig, 123, "test", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("close", 0);

			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				"pi",
				expect.any(Array),
				expect.objectContaining({
					env: expect.objectContaining({
						PI_AGENT_DIR: "/test/home/.pi/agent",
					}),
				}),
			);

			process.env.HOME = originalHome;
		});

		it("should handle negative chat IDs in session path", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = runPi(mockConfig, -100123, "test", "/workspace");

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("close", 0);

			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				"pi",
				expect.arrayContaining([
					"--session",
					"/mock/sessions/telegram--100123.jsonl",
				]),
				expect.any(Object),
			);
		});
	});

	describe("checkPiAuth", () => {
		it("should return true when pi --version succeeds", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = checkPiAuth();

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("close", 0);

			const result = await resultPromise;
			expect(result).toBe(true);
		});

		it("should return false when pi --version fails", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = checkPiAuth();

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("close", 1);

			const result = await resultPromise;
			expect(result).toBe(false);
		});

		it("should return false when spawn fails", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = checkPiAuth();

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("error", new Error("ENOENT"));

			const result = await resultPromise;
			expect(result).toBe(false);
		});

		it("should call pi with --version flag", async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValue(mockProc);

			const resultPromise = checkPiAuth();

			await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
			mockProc.emit("close", 0);

			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith("pi", ["--version"], {
				stdio: ["ignore", "pipe", "pipe"],
			});
		});
	});
});
