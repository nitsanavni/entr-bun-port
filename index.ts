#!/usr/bin/env bun

import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import createDebug from "debug";
import type { Options } from "./types";
import { parseArguments } from "./args";
import { readFilesFromStdin, getGitTrackedFiles } from "./files";
import {
	executeCommand,
	killCurrentProcess,
	getCurrentProcess,
} from "./executor";
import { setupWatchers } from "./watcher";

const debug = createDebug("entr:main");

const args = Bun.argv.slice(2);

async function main() {
	debug("Starting entr with arguments:", args);
	const options = parseArguments(args);
	debug("Parsed options:", {
		...options,
		watchedDirs: Array.from(options.watchedDirs),
	});

	if (!process.stdin.isTTY) {
		debug("Reading files from stdin");
		options.files = await readFilesFromStdin();
		debug(`Read ${options.files.length} files from stdin`);
	} else {
		// Default to git tracked files if no files provided via stdin
		debug("No stdin input, using git tracked files");
		options.files = await getGitTrackedFiles();
		debug(`Found ${options.files.length} git tracked files`);
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
		debug("Running initial command execution");
		await executeCommand(options);
	} else {
		debug("Postponing initial execution (-p flag set)");
	}

	console.error(`Watching ${options.files.length} file(s)...`);

	let lastExecutionTime = 0;
	const debounceDelay = options.all ? 0 : 100;

	const watcherSetup = setupWatchers(options, async (file, isNew) => {
		if (isNew && options.directories) {
			debug("New file detected in watched directory");
			console.error(`\nentr: directory altered`);
			killCurrentProcess();
			process.exit(2);
		}

		const now = Date.now();
		debug(`File change callback triggered for: ${file}`);

		if (!options.all && getCurrentProcess()) {
			debug("Skipping execution - process already running and -a flag not set");
			return;
		}

		if (now - lastExecutionTime < debounceDelay) {
			debug(
				`Skipping execution - debounce delay not met (${now - lastExecutionTime}ms < ${debounceDelay}ms)`,
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
				debug(
					`Keyboard input received: ${char === " " ? "SPACE" : char === "\x03" ? "CTRL+C" : char === "q" ? "q" : `char code ${char.charCodeAt(0)}`}`,
				);

				if (char === " ") {
					debug("Manual execution triggered via spacebar");
					await executeCommand(options);
				} else if (char === "q" || char === "\x03") {
					debug("Quit requested via keyboard");
					killCurrentProcess();
					process.exit(0);
				}
			});
		} catch (_err) {
			console.error("Warning: Could not set up keyboard input");
		}
	}

	process.on("SIGINT", () => {
		debug("SIGINT received - shutting down");
		killCurrentProcess();
		watcherSetup.cleanup();
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		debug("SIGTERM received - shutting down");
		killCurrentProcess();
		watcherSetup.cleanup();
		process.exit(0);
	});

	await new Promise(() => {});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
