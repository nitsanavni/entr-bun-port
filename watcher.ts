import { watch, statSync } from "node:fs";
import { resolve } from "node:path";
import createDebug from "debug";
import type { Options } from "./types";

const debug = createDebug("entr:watcher");

export function setupWatchers(
	options: Options,
	callback: (file: string, isNew?: boolean) => void,
) {
	const watchers: ReturnType<typeof watch>[] = [];

	for (const file of options.files) {
		let watcher: ReturnType<typeof watch>;

		const setupFileWatcher = () => {
			watcher = watch(file, (eventType, _filename) => {
				debug(`File watcher event: ${eventType} on ${file}`);

				if (eventType === "rename") {
					// On rename, we need to re-establish the watcher
					debug(`Rename detected on ${file}, re-establishing watcher`);

					// Close the old watcher and create a new one
					watcher.close();
					setTimeout(() => {
						debug(`Re-watching file: ${file}`);
						setupFileWatcher();
					}, 10);

					// Trigger callback for the rename itself
					callback(file);
				} else if (eventType === "change") {
					debug(`Change detected on ${file}`);
					callback(file);
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
			// Close all watchers
			for (const watcher of watchers) {
				watcher.close();
			}
		},
	};
}
