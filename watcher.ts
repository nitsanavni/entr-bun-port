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
		const watcher = watch(file, (eventType, _filename) => {
			debug(`File watcher event: ${eventType} on ${file}`);
			if (eventType === "change" || eventType === "rename") {
				debug(`Triggering callback for file: ${file}`);
				callback(file);
			}
		});
		watchers.push(watcher);
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

	return watchers;
}
