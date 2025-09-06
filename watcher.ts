import { watch, statSync, watchFile, unwatchFile } from "node:fs";
import { resolve } from "node:path";
import createDebug from "debug";
import type { Options } from "./types";

const debug = createDebug("entr:watcher");

// Track active polling for files that had recent rename events
const recentRenames = new Map<string, NodeJS.Timeout>();

export function setupWatchers(
	options: Options,
	callback: (file: string, isNew?: boolean) => void,
) {
	const watchers: ReturnType<typeof watch>[] = [];
	const eventQueue = new Map<string, NodeJS.Timeout>();

	// Debounced callback to merge rapid events
	const debouncedCallback = (file: string, isNew?: boolean) => {
		// Clear any pending callback for this file
		if (eventQueue.has(file)) {
			clearTimeout(eventQueue.get(file)!);
		}

		// Set a new timeout to call the callback
		const timeout = setTimeout(() => {
			eventQueue.delete(file);
			callback(file, isNew);
		}, 50); // 50ms delay to catch rapid successive changes

		eventQueue.set(file, timeout);
	};

	for (const file of options.files) {
		let watcher: ReturnType<typeof watch>;

		const setupFileWatcher = () => {
			watcher = watch(file, (eventType, _filename) => {
				debug(`File watcher event: ${eventType} on ${file}`);

				if (eventType === "rename") {
					// On rename, we need to re-establish the watcher
					debug(
						`Rename detected on ${file}, re-establishing watcher and enabling temporary polling`,
					);

					// Close the old watcher and create a new one
					watcher.close();
					setTimeout(() => {
						debug(`Re-watching file: ${file}`);
						setupFileWatcher();
					}, 10);

					// Clear any existing polling for this file
					if (recentRenames.has(file)) {
						clearTimeout(recentRenames.get(file)!);
						unwatchFile(file);
					}

					// Start polling for a short period after rename
					// Use a shorter interval (50ms) to catch rapid changes
					watchFile(file, { interval: 50 }, (curr, prev) => {
						if (curr.mtime.getTime() !== prev.mtime.getTime()) {
							debug(`Polling detected change on ${file}`);
							debouncedCallback(file);
						}
					});

					// Stop polling after 2 seconds (increased from 1 second)
					const stopPollingTimeout = setTimeout(() => {
						debug(`Stopping polling for ${file}`);
						unwatchFile(file);
						recentRenames.delete(file);
					}, 2000);

					recentRenames.set(file, stopPollingTimeout);

					// Also trigger callback for the rename itself
					debouncedCallback(file);
				} else if (eventType === "change") {
					debug(`Change detected on ${file}`);
					debouncedCallback(file);
				}
			});
			watchers.push(watcher);
		};

		setupFileWatcher();
		debug(`Watching file: ${file}`);
	}

	if (options.directories) {
		for (const dir of options.watchedDirs) {
			const watcher = watch(
				dir,
				{ recursive: false },
				(eventType, filename) => {
					debug(
						`Directory watcher event: ${eventType} in ${dir}, filename: ${filename}`,
					);
					if (eventType === "rename" && filename) {
						const fullPath = resolve(dir, filename);
						try {
							statSync(fullPath);
							debug(`New file detected: ${fullPath}`);
							if (!options.directoriesTwice && filename.startsWith(".")) {
								debug(`Ignoring dotfile: ${filename}`);
								return;
							}
							debug(`Triggering callback for new file: ${fullPath}`);
							callback(fullPath, true);
						} catch {
							debug(`File no longer exists or cannot stat: ${fullPath}`);
						}
					}
				},
			);
			watchers.push(watcher);
			debug(`Watching directory: ${dir}`);
		}
	}

	// Return cleanup function along with watchers
	return {
		watchers,
		cleanup: () => {
			// Clear all debounce timeouts
			for (const timeout of eventQueue.values()) {
				clearTimeout(timeout);
			}
			eventQueue.clear();

			// Clear all polling timeouts and unwatchFile
			for (const [file, timeout] of recentRenames.entries()) {
				clearTimeout(timeout);
				unwatchFile(file);
			}
			recentRenames.clear();

			// Close all watchers
			for (const watcher of watchers) {
				watcher.close();
			}
		},
	};
}
