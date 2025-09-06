import { $ } from "bun";

export async function readFilesFromStdin(): Promise<string[]> {
	let buffer = "";

	for await (const chunk of Bun.stdin.stream()) {
		buffer += Buffer.from(chunk).toString();
	}

	const lines = buffer.split("\n").filter((line) => line.trim());
	return lines;
}

export async function getGitTrackedFiles(): Promise<string[]> {
	try {
		// Get both tracked files and untracked files (respecting .gitignore)
		const trackedResult = await $`git ls-files`.quiet();
		const untrackedResult = await $`git ls-files -o --exclude-standard`.quiet();

		const trackedFiles = trackedResult
			.text()
			.split("\n")
			.filter((line) => line.trim());
		const untrackedFiles = untrackedResult
			.text()
			.split("\n")
			.filter((line) => line.trim());

		// Combine and deduplicate
		const allFiles = [...new Set([...trackedFiles, ...untrackedFiles])];
		return allFiles;
	} catch {
		return [];
	}
}
