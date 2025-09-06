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
	const options = parseArguments(args);

	if (!process.stdin.isTTY) {
		options.files = await readFilesFromStdin();
	} else {
		// Default to git tracked files if no files provided via stdin
		options.files = await getGitTrackedFiles();
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
		await executeCommand(options);
	}

	console.error(`Watching ${options.files.length} file(s)...`);

	let lastExecutionTime = 0;
	const debounceDelay = options.all ? 0 : 100;

	const _watchers = setupWatchers(options, async (file, isNew) => {
		if (isNew && options.directories) {
			console.error(`\nentr: directory altered`);
			killCurrentProcess();
			process.exit(2);
		}

		const now = Date.now();

		if (!options.all && getCurrentProcess()) {
			return;
		}

		if (now - lastExecutionTime < debounceDelay) {
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

				if (char === " ") {
					await executeCommand(options);
				} else if (char === "q" || char === "\x03") {
					killCurrentProcess();
					process.exit(0);
				}
			});
		} catch (_err) {
			console.error("Warning: Could not set up keyboard input");
		}
	}

	process.on("SIGINT", () => {
		killCurrentProcess();
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		killCurrentProcess();
		process.exit(0);
	});

	await new Promise(() => {});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
