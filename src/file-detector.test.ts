import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs/promises
const mockReaddir = vi.fn();
const mockStat = vi.fn();

vi.mock("node:fs/promises", () => ({
	readdir: (...args: unknown[]) => mockReaddir(...args),
	stat: (...args: unknown[]) => mockStat(...args),
}));

const {
	parseOutputForFiles,
	categorizeFiles,
	detectNewFiles,
	snapshotWorkspace,
	detectFiles,
} = await import("./file-detector.js");

describe("file-detector", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("parseOutputForFiles", () => {
		it("should detect 'Created:' pattern", () => {
			const output = "Created: /path/to/file.pdf";
			const files = parseOutputForFiles(output);
			expect(files).toContain("/path/to/file.pdf");
		});

		it("should detect 'Saved to:' pattern", () => {
			const output = "Saved to: /home/user/image.png";
			const files = parseOutputForFiles(output);
			expect(files).toContain("/home/user/image.png");
		});

		it("should detect 'Wrote:' pattern", () => {
			const output = "Wrote: /tmp/output.json";
			const files = parseOutputForFiles(output);
			expect(files).toContain("/tmp/output.json");
		});

		it("should detect 'Generated:' pattern", () => {
			const output = "Generated: /workspace/report.pdf";
			const files = parseOutputForFiles(output);
			expect(files).toContain("/workspace/report.pdf");
		});

		it("should detect lowercase patterns", () => {
			const output = "saved to /data/file.csv";
			const files = parseOutputForFiles(output);
			expect(files).toContain("/data/file.csv");
		});

		it("should detect multiple files", () => {
			const output = `
				Created: /path/to/file1.pdf
				Saved to: /path/to/file2.png
			`;
			const files = parseOutputForFiles(output);
			expect(files).toHaveLength(2);
			expect(files).toContain("/path/to/file1.pdf");
			expect(files).toContain("/path/to/file2.png");
		});

		it("should ignore relative paths", () => {
			const output = "Created: ./relative/file.pdf";
			const files = parseOutputForFiles(output);
			expect(files).toHaveLength(0);
		});

		it("should return empty array for no matches", () => {
			const output = "No files were created";
			const files = parseOutputForFiles(output);
			expect(files).toHaveLength(0);
		});

		it("should deduplicate same file mentioned multiple times", () => {
			const output = `
				Created: /path/to/file.pdf
				File saved: /path/to/file.pdf
			`;
			const files = parseOutputForFiles(output);
			expect(files).toHaveLength(1);
		});
	});

	describe("categorizeFiles", () => {
		it("should categorize PNG as photo", () => {
			const result = categorizeFiles(["/path/image.png"]);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				path: "/path/image.png",
				filename: "image.png",
				type: "photo",
			});
		});

		it("should categorize JPG as photo", () => {
			const result = categorizeFiles(["/path/photo.jpg"]);
			expect(result[0].type).toBe("photo");
		});

		it("should categorize JPEG as photo", () => {
			const result = categorizeFiles(["/path/photo.jpeg"]);
			expect(result[0].type).toBe("photo");
		});

		it("should categorize GIF as photo", () => {
			const result = categorizeFiles(["/path/anim.gif"]);
			expect(result[0].type).toBe("photo");
		});

		it("should categorize WebP as photo", () => {
			const result = categorizeFiles(["/path/image.webp"]);
			expect(result[0].type).toBe("photo");
		});

		it("should categorize PDF as document", () => {
			const result = categorizeFiles(["/path/doc.pdf"]);
			expect(result[0].type).toBe("document");
		});

		it("should categorize TXT as document", () => {
			const result = categorizeFiles(["/path/notes.txt"]);
			expect(result[0].type).toBe("document");
		});

		it("should categorize MD as document", () => {
			const result = categorizeFiles(["/path/readme.md"]);
			expect(result[0].type).toBe("document");
		});

		it("should categorize JSON as document", () => {
			const result = categorizeFiles(["/path/data.json"]);
			expect(result[0].type).toBe("document");
		});

		it("should categorize CSV as document", () => {
			const result = categorizeFiles(["/path/data.csv"]);
			expect(result[0].type).toBe("document");
		});

		it("should ignore unsupported file types", () => {
			const result = categorizeFiles(["/path/file.exe", "/path/file.bin"]);
			expect(result).toHaveLength(0);
		});

		it("should handle mixed file types", () => {
			const result = categorizeFiles([
				"/path/image.png",
				"/path/doc.pdf",
				"/path/unknown.xyz",
			]);
			expect(result).toHaveLength(2);
			expect(result.find((f) => f.filename === "image.png")?.type).toBe(
				"photo",
			);
			expect(result.find((f) => f.filename === "doc.pdf")?.type).toBe(
				"document",
			);
		});

		it("should handle case-insensitive extensions", () => {
			const result = categorizeFiles(["/path/IMAGE.PNG", "/path/DOC.PDF"]);
			expect(result).toHaveLength(2);
		});
	});

	describe("snapshotWorkspace", () => {
		it("should return file map with modification times", async () => {
			mockReaddir.mockResolvedValue([
				{ name: "file1.txt", isFile: () => true },
				{ name: "file2.pdf", isFile: () => true },
			]);
			mockStat.mockResolvedValue({ mtimeMs: 1000 });

			const snapshot = await snapshotWorkspace("/workspace");

			expect(snapshot.size).toBe(2);
			expect(snapshot.has("/workspace/file1.txt")).toBe(true);
			expect(snapshot.has("/workspace/file2.pdf")).toBe(true);
		});

		it("should skip directories", async () => {
			mockReaddir.mockResolvedValue([
				{ name: "file.txt", isFile: () => true },
				{ name: "subdir", isFile: () => false },
			]);
			mockStat.mockResolvedValue({ mtimeMs: 1000 });

			const snapshot = await snapshotWorkspace("/workspace");

			expect(snapshot.size).toBe(1);
			expect(snapshot.has("/workspace/file.txt")).toBe(true);
		});

		it("should return empty map if directory does not exist", async () => {
			mockReaddir.mockRejectedValue(new Error("ENOENT"));

			const snapshot = await snapshotWorkspace("/nonexistent");

			expect(snapshot.size).toBe(0);
		});
	});

	describe("detectNewFiles", () => {
		it("should detect new files", async () => {
			const before = new Map<string, number>();

			mockReaddir.mockResolvedValue([
				{ name: "newfile.pdf", isFile: () => true },
			]);
			mockStat.mockResolvedValue({ mtimeMs: 2000 });

			const newFiles = await detectNewFiles("/workspace", before);

			expect(newFiles).toContain("/workspace/newfile.pdf");
		});

		it("should detect modified files", async () => {
			const before = new Map<string, number>([["/workspace/file.txt", 1000]]);

			mockReaddir.mockResolvedValue([{ name: "file.txt", isFile: () => true }]);
			mockStat.mockResolvedValue({ mtimeMs: 2000 }); // Modified

			const newFiles = await detectNewFiles("/workspace", before);

			expect(newFiles).toContain("/workspace/file.txt");
		});

		it("should not detect unchanged files", async () => {
			const before = new Map<string, number>([["/workspace/file.txt", 1000]]);

			mockReaddir.mockResolvedValue([{ name: "file.txt", isFile: () => true }]);
			mockStat.mockResolvedValue({ mtimeMs: 1000 }); // Same time

			const newFiles = await detectNewFiles("/workspace", before);

			expect(newFiles).toHaveLength(0);
		});
	});

	describe("detectFiles", () => {
		it("should combine parsed output and workspace changes", async () => {
			mockReaddir.mockResolvedValue([
				{ name: "new-from-workspace.png", isFile: () => true },
			]);
			mockStat.mockResolvedValue({ mtimeMs: 2000 });

			const before = new Map<string, number>();
			const output = "Created: /other/path/file.pdf";

			const files = await detectFiles(output, "/workspace", before);

			expect(files.length).toBeGreaterThanOrEqual(1);
		});

		it("should deduplicate files from both sources", async () => {
			mockReaddir.mockResolvedValue([{ name: "file.pdf", isFile: () => true }]);
			mockStat.mockResolvedValue({ mtimeMs: 2000 });

			const before = new Map<string, number>();
			const output = "Created: /workspace/file.pdf"; // Same file

			const files = await detectFiles(output, "/workspace", before);

			const pdfFiles = files.filter((f) => f.filename === "file.pdf");
			expect(pdfFiles).toHaveLength(1);
		});
	});
});
