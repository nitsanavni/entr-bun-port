#!/usr/bin/env bun

import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Options } from "./types";
import { parseArguments } from "./args";
import { readFilesFromStdin, getGitTrackedFiles } from "./files";
import {
	executeCommand,
	killCurrentProcess,
	getCurrentProcess,
} from "./executor";
import { setupWatchers } from "./watcher";

const args = Bun.argv.slice(2);

async function main() {
	console.error("[DEBUG] Starting entr with arguments:", args);
	const options = parseArguments(args);
	console.error(
		"[DEBUG] Parsed options:",
		JSON.stringify({
			...options,
			watchedDirs: Array.from(options.watchedDirs),
		}),
	);

	if (!process.stdin.isTTY) {
		console.error("[DEBUG] Reading files from stdin");
		options.files = await readFilesFromStdin();
		console.error(`[DEBUG] Read ${options.files.length} files from stdin`);
	} else {
		// Default to git tracked files if no files provided via stdin
		console.error("[DEBUG] No stdin input, using git tracked files");
		options.files = await getGitTrackedFiles();
		console.error(`[DEBUG] Found ${options.files.length} git tracked files`);
		if (options.files.length === 0) {
			console.error("No git tracked files found");
			process.exit(1);
		}
	}

	const existingFiles: string[] = [];
	const dirsToWatch = new Set<string>();

	for (const file of options.files) {
		try {
			const fileStat = statSync(file);
			if (fileStat.isDirectory()) {
				if (options.directories) {
					dirsToWatch.add(resolve(file));
				} else {
					console.error(
						`Warning: ${file} is a directory (use -d flag to watch directories)`,
					);
				}
			} else if (fileStat.isFile()) {
				existingFiles.push(file);
				if (options.directories) {
					dirsToWatch.add(dirname(resolve(file)));
				}
			}
		} catch {
			console.error(`Warning: ${file} does not exist`);
		}
	}

	options.watchedDirs = dirsToWatch;

	if (existingFiles.length === 0) {
		console.error("No valid files to watch");
		process.exit(1);
	}

	options.files = existingFiles;

	if (!options.postpone) {
		console.error("[DEBUG] Running initial command execution");
		await executeCommand(options);
	} else {
		console.error("[DEBUG] Postponing initial execution (-p flag set)");
	}

	console.error(`Watching ${options.files.length} file(s)...`);

	let lastExecutionTime = 0;
	const debounceDelay = options.all ? 0 : 100;

	const _watchers = setupWatchers(options, async (file, isNew) => {
		if (isNew && options.directories) {
			console.error(`[DEBUG] New file detected in watched directory`);
			console.error(`\nentr: directory altered`);
			killCurrentProcess();
			process.exit(2);
		}

		const now = Date.now();
		console.error(`[DEBUG] File change callback triggered for: ${file}`);

		if (!options.all && getCurrentProcess()) {
			console.error(
				`[DEBUG] Skipping execution - process already running and -a flag not set`,
			);
			return;
		}

		if (now - lastExecutionTime < debounceDelay) {
			console.error(
				`[DEBUG] Skipping execution - debounce delay not met (${now - lastExecutionTime}ms < ${debounceDelay}ms)`,
			);
			return;
		}

		lastExecutionTime = now;
		await executeCommand(options, file);
	});

	if (!options.nonInteractive && process.stdin.isTTY) {
		try {
			process.stdin.setRawMode(true);
			process.stdin.on("data", async (key) => {
				const char = key.toString();
				console.error(
					`[DEBUG] Keyboard input received: ${char === " " ? "SPACE" : char === "\x03" ? "CTRL+C" : char === "q" ? "q" : `char code ${char.charCodeAt(0)}`}`,
				);

				if (char === " ") {
					console.error(`[DEBUG] Manual execution triggered via spacebar`);
					await executeCommand(options);
				} else if (char === "q" || char === "\x03") {
					console.error(`[DEBUG] Quit requested via keyboard`);
					killCurrentProcess();
					process.exit(0);
				}
			});
		} catch (_err) {
			console.error("Warning: Could not set up keyboard input");
		}
	}

	process.on("SIGINT", () => {
		console.error("[DEBUG] SIGINT received - shutting down");
		killCurrentProcess();
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		console.error("[DEBUG] SIGTERM received - shutting down");
		killCurrentProcess();
		process.exit(0);
	});

	await new Promise(() => {});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
