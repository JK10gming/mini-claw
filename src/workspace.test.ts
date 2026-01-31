import { beforeEach, describe, expect, it, vi } from "vitest";

// Create mock instances
const mockAccess = vi.fn();
const mockMkdir = vi.fn();
const mockReadFile = vi.fn();
const mockStat = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("node:fs/promises", () => ({
	access: (...args: unknown[]) => mockAccess(...args),
	mkdir: (...args: unknown[]) => mockMkdir(...args),
	readFile: (...args: unknown[]) => mockReadFile(...args),
	stat: (...args: unknown[]) => mockStat(...args),
	writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

vi.mock("node:os", () => ({
	homedir: () => "/mock/home",
}));

describe("workspace", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		// Reset the module's internal state by re-importing
		mockReadFile.mockRejectedValue(new Error("ENOENT")); // Default: no state file
		mockMkdir.mockResolvedValue(undefined);
		mockWriteFile.mockResolvedValue(undefined);
	});

	describe("getWorkspace", () => {
		it("should return home directory when no state exists", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));

			const { getWorkspace } = await import("./workspace.js");
			const result = await getWorkspace(123);

			expect(result).toBe("/mock/home");
		});

		it("should return stored workspace when it exists", async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ "123": "/stored/path" }));
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { getWorkspace } = await import("./workspace.js");
			const result = await getWorkspace(123);

			expect(result).toBe("/stored/path");
		});

		it("should return home if stored directory no longer exists", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({ "123": "/deleted/path" }),
			);
			mockStat.mockRejectedValue(new Error("ENOENT"));

			const { getWorkspace } = await import("./workspace.js");
			const result = await getWorkspace(123);

			expect(result).toBe("/mock/home");
		});

		it("should return home if stored path is not a directory", async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ "123": "/some/file" }));
			mockStat.mockResolvedValue({ isDirectory: () => false });

			const { getWorkspace } = await import("./workspace.js");
			const result = await getWorkspace(123);

			expect(result).toBe("/mock/home");
		});

		it("should handle corrupted state file", async () => {
			mockReadFile.mockResolvedValue("not valid json");

			const { getWorkspace } = await import("./workspace.js");
			const result = await getWorkspace(123);

			expect(result).toBe("/mock/home");
		});

		it("should load state only once (caching)", async () => {
			mockReadFile.mockResolvedValue(JSON.stringify({ "123": "/cached/path" }));
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { getWorkspace } = await import("./workspace.js");
			await getWorkspace(123);
			await getWorkspace(123);
			await getWorkspace(456);

			// Should only read file once
			expect(mockReadFile).toHaveBeenCalledTimes(1);
		});

		it("should handle different chat IDs independently", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					"123": "/path/for/123",
					"456": "/path/for/456",
				}),
			);
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { getWorkspace } = await import("./workspace.js");
			const result123 = await getWorkspace(123);
			const result456 = await getWorkspace(456);

			expect(result123).toBe("/path/for/123");
			expect(result456).toBe("/path/for/456");
		});
	});

	describe("setWorkspace", () => {
		it("should expand ~ to home directory", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));
			mockAccess.mockResolvedValue(undefined);
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { setWorkspace } = await import("./workspace.js");
			const result = await setWorkspace(123, "~/projects");

			expect(result).toBe("/mock/home/projects");
		});

		it("should resolve relative paths from current workspace", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({ "123": "/current/workspace" }),
			);
			mockAccess.mockResolvedValue(undefined);
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { setWorkspace } = await import("./workspace.js");
			const result = await setWorkspace(123, "subdir");

			expect(result).toBe("/current/workspace/subdir");
		});

		it("should handle absolute paths directly", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));
			mockAccess.mockResolvedValue(undefined);
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { setWorkspace } = await import("./workspace.js");
			const result = await setWorkspace(123, "/absolute/path");

			expect(result).toBe("/absolute/path");
		});

		it("should resolve .. in paths", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({ "123": "/current/workspace/deep" }),
			);
			mockAccess.mockResolvedValue(undefined);
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { setWorkspace } = await import("./workspace.js");
			const result = await setWorkspace(123, "..");

			expect(result).toBe("/current/workspace");
		});

		it("should throw error when directory does not exist", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));
			mockAccess.mockRejectedValue(new Error("ENOENT"));

			const { setWorkspace } = await import("./workspace.js");

			await expect(setWorkspace(123, "/nonexistent")).rejects.toThrow(
				"Directory not found: /nonexistent",
			);
		});

		it("should throw error when path is not a directory", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));
			mockAccess.mockResolvedValue(undefined);
			mockStat.mockResolvedValue({ isDirectory: () => false });

			const { setWorkspace } = await import("./workspace.js");

			await expect(setWorkspace(123, "/some/file")).rejects.toThrow(
				"Not a directory: /some/file",
			);
		});

		it("should save state to file", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));
			mockAccess.mockResolvedValue(undefined);
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { setWorkspace } = await import("./workspace.js");
			await setWorkspace(123, "/new/path");

			expect(mockWriteFile).toHaveBeenCalledWith(
				"/mock/home/.mini-claw/workspaces.json",
				expect.stringContaining("/new/path"),
			);
		});

		it("should create state directory if it doesn't exist", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));
			mockAccess.mockResolvedValue(undefined);
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { setWorkspace } = await import("./workspace.js");
			await setWorkspace(123, "/new/path");

			expect(mockMkdir).toHaveBeenCalledWith("/mock/home/.mini-claw", {
				recursive: true,
			});
		});

		it("should preserve other chat workspaces when updating", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({ "456": "/other/workspace" }),
			);
			mockAccess.mockResolvedValue(undefined);
			mockStat.mockResolvedValue({ isDirectory: () => true });

			const { setWorkspace } = await import("./workspace.js");
			await setWorkspace(123, "/new/path");

			const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
			expect(savedData["456"]).toBe("/other/workspace");
			expect(savedData["123"]).toBe("/new/path");
		});
	});

	describe("formatPath", () => {
		it("should return ~ for home directory", async () => {
			const { formatPath } = await import("./workspace.js");
			expect(formatPath("/mock/home")).toBe("~");
		});

		it("should replace home prefix with ~", async () => {
			const { formatPath } = await import("./workspace.js");
			expect(formatPath("/mock/home/projects/myapp")).toBe("~/projects/myapp");
		});

		it("should not modify paths outside home", async () => {
			const { formatPath } = await import("./workspace.js");
			expect(formatPath("/var/log")).toBe("/var/log");
		});

		it("should not match partial home paths", async () => {
			const { formatPath } = await import("./workspace.js");
			// /mock/home2 should not be treated as home directory
			expect(formatPath("/mock/home2/stuff")).toBe("/mock/home2/stuff");
		});

		it("should handle home with trailing content", async () => {
			const { formatPath } = await import("./workspace.js");
			expect(formatPath("/mock/homedir")).toBe("/mock/homedir");
		});
	});
});
