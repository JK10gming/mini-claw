import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

// Supported file types for sending back to Telegram
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const DOCUMENT_EXTENSIONS = new Set([
	".pdf",
	".txt",
	".md",
	".json",
	".csv",
	".html",
	".xml",
	".yaml",
	".yml",
]);

export interface DetectedFile {
	path: string;
	filename: string;
	type: "photo" | "document";
}

/**
 * Parse Pi output for file paths
 * Looks for patterns like:
 * - Created: /path/to/file.pdf
 * - Saved to: /path/to/file.png
 * - Wrote: /path/to/file.txt
 * - Output: /path/to/file.json
 * - File saved: /path/to/file.md
 */
export function parseOutputForFiles(output: string): string[] {
	const patterns = [
		/(?:Created|Saved to|Wrote|Output|File saved|Generated|Exported):\s*([^\s]+\.\w+)/gi,
		/(?:saved|wrote|created|generated|exported)\s+(?:to\s+)?["']?([^\s"']+\.\w+)["']?/gi,
		/(?:file|output):\s*["']?([^\s"']+\.\w+)["']?/gi,
	];

	const files = new Set<string>();

	for (const pattern of patterns) {
		const matches = output.matchAll(pattern);
		for (const match of matches) {
			const filePath = match[1];
			if (filePath?.startsWith("/")) {
				files.add(filePath);
			}
		}
	}

	return Array.from(files);
}

/**
 * Get list of files in a directory with their modification times
 */
async function getFileList(dir: string): Promise<Map<string, number>> {
	const files = new Map<string, number>();

	try {
		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isFile()) {
				const filePath = join(dir, entry.name);
				try {
					const stats = await stat(filePath);
					files.set(filePath, stats.mtimeMs);
				} catch {
					// Skip files we can't stat
				}
			}
		}
	} catch {
		// Directory doesn't exist or can't be read
	}

	return files;
}

/**
 * Detect new files created in workspace
 */
export async function detectNewFiles(
	workspace: string,
	beforeFiles: Map<string, number>,
): Promise<string[]> {
	const afterFiles = await getFileList(workspace);
	const newFiles: string[] = [];

	for (const [path, mtime] of afterFiles) {
		const beforeMtime = beforeFiles.get(path);
		// File is new or modified
		if (beforeMtime === undefined || mtime > beforeMtime) {
			newFiles.push(path);
		}
	}

	return newFiles;
}

/**
 * Get snapshot of workspace files before Pi execution
 */
export async function snapshotWorkspace(
	workspace: string,
): Promise<Map<string, number>> {
	return getFileList(workspace);
}

/**
 * Filter and categorize files by supported types
 */
export function categorizeFiles(filePaths: string[]): DetectedFile[] {
	const result: DetectedFile[] = [];

	for (const filePath of filePaths) {
		const ext = extname(filePath).toLowerCase();
		const filename = filePath.split("/").pop() || filePath;

		if (IMAGE_EXTENSIONS.has(ext)) {
			result.push({ path: filePath, filename, type: "photo" });
		} else if (DOCUMENT_EXTENSIONS.has(ext)) {
			result.push({ path: filePath, filename, type: "document" });
		}
	}

	return result;
}

/**
 * Main function to detect files from Pi output and workspace changes
 */
export async function detectFiles(
	output: string,
	workspace: string,
	beforeSnapshot: Map<string, number>,
): Promise<DetectedFile[]> {
	// Method 1: Parse output for file paths
	const parsedFiles = parseOutputForFiles(output);

	// Method 2: Detect new files in workspace
	const newFiles = await detectNewFiles(workspace, beforeSnapshot);

	// Combine and deduplicate
	const allFiles = new Set([...parsedFiles, ...newFiles]);

	// Filter to supported types
	return categorizeFiles(Array.from(allFiles));
}
