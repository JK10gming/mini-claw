import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must mock before importing
vi.mock("node:os", () => ({
	homedir: vi.fn(() => "/mock/home"),
}));

describe("config", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("loadConfig", () => {
		it("should throw error when TELEGRAM_BOT_TOKEN is not set", async () => {
			delete process.env.TELEGRAM_BOT_TOKEN;
			const { loadConfig } = await import("./config.js");
			expect(() => loadConfig()).toThrow(
				"TELEGRAM_BOT_TOKEN is required. Set it in .env file.",
			);
		});

		it("should throw error when TELEGRAM_BOT_TOKEN is empty string", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "";
			const { loadConfig } = await import("./config.js");
			expect(() => loadConfig()).toThrow("TELEGRAM_BOT_TOKEN is required");
		});

		it("should throw error when TELEGRAM_BOT_TOKEN is only whitespace", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "   ";
			const { loadConfig } = await import("./config.js");
			expect(() => loadConfig()).toThrow("TELEGRAM_BOT_TOKEN is required");
		});

		it("should trim TELEGRAM_BOT_TOKEN", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "  my-token  ";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.telegramToken).toBe("my-token");
		});

		it("should use default workspace when MINI_CLAW_WORKSPACE is not set", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			delete process.env.MINI_CLAW_WORKSPACE;
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.workspace).toBe("/mock/home/mini-claw-workspace");
		});

		it("should use custom workspace when MINI_CLAW_WORKSPACE is set", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.MINI_CLAW_WORKSPACE = "/custom/workspace";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.workspace).toBe("/custom/workspace");
		});

		it("should trim MINI_CLAW_WORKSPACE", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.MINI_CLAW_WORKSPACE = "  /custom/path  ";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.workspace).toBe("/custom/path");
		});

		it("should use default session directory when MINI_CLAW_SESSION_DIR is not set", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			delete process.env.MINI_CLAW_SESSION_DIR;
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.sessionDir).toBe("/mock/home/.mini-claw/sessions");
		});

		it("should use custom session directory when MINI_CLAW_SESSION_DIR is set", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.MINI_CLAW_SESSION_DIR = "/custom/sessions";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.sessionDir).toBe("/custom/sessions");
		});

		it("should use 'low' thinking level by default", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			delete process.env.PI_THINKING_LEVEL;
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.thinkingLevel).toBe("low");
		});

		it("should accept 'medium' thinking level", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.PI_THINKING_LEVEL = "medium";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.thinkingLevel).toBe("medium");
		});

		it("should accept 'high' thinking level", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.PI_THINKING_LEVEL = "high";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.thinkingLevel).toBe("high");
		});

		it("should trim PI_THINKING_LEVEL", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.PI_THINKING_LEVEL = "  high  ";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.thinkingLevel).toBe("high");
		});

		it("should return empty allowedUsers array when ALLOWED_USERS is not set", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			delete process.env.ALLOWED_USERS;
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.allowedUsers).toEqual([]);
		});

		it("should return empty allowedUsers array when ALLOWED_USERS is empty", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.ALLOWED_USERS = "";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.allowedUsers).toEqual([]);
		});

		it("should parse single ALLOWED_USERS value", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.ALLOWED_USERS = "123456";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.allowedUsers).toEqual([123456]);
		});

		it("should parse multiple ALLOWED_USERS values", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.ALLOWED_USERS = "123,456,789";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.allowedUsers).toEqual([123, 456, 789]);
		});

		it("should trim whitespace from ALLOWED_USERS values", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.ALLOWED_USERS = " 123 , 456 , 789 ";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.allowedUsers).toEqual([123, 456, 789]);
		});

		it("should filter out invalid (NaN) ALLOWED_USERS values", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.ALLOWED_USERS = "123,invalid,456,abc,789";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.allowedUsers).toEqual([123, 456, 789]);
		});

		it("should handle negative user IDs", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.ALLOWED_USERS = "-123,456,-789";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();
			expect(config.allowedUsers).toEqual([-123, 456, -789]);
		});

		it("should return all expected config properties", async () => {
			process.env.TELEGRAM_BOT_TOKEN = "test-token";
			process.env.MINI_CLAW_WORKSPACE = "/workspace";
			process.env.MINI_CLAW_SESSION_DIR = "/sessions";
			process.env.PI_THINKING_LEVEL = "high";
			process.env.ALLOWED_USERS = "123,456";
			const { loadConfig } = await import("./config.js");
			const config = loadConfig();

			expect(config).toEqual({
				telegramToken: "test-token",
				workspace: "/workspace",
				sessionDir: "/sessions",
				thinkingLevel: "high",
				allowedUsers: [123, 456],
			});
		});
	});
});
