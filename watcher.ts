import { watch, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Options } from "./types";

export function setupWatchers(
	options: Options,
	callback: (file: string, isNew?: boolean) => void,
) {
	const watchers: ReturnType<typeof watch>[] = [];

	for (const file of options.files) {
		const watcher = watch(file, (eventType, _filename) => {
			if (eventType === "change" || eventType === "rename") {
				callback(file);
			}
		});
		watchers.push(watcher);
	}

	if (options.directories) {
		for (const dir of options.watchedDirs) {
			const watcher = watch(
				dir,
				{ recursive: false },
				(eventType, filename) => {
					if (eventType === "rename" && filename) {
						const fullPath = resolve(dir, filename);
						try {
							statSync(fullPath);
							if (!options.directoriesTwice && filename.startsWith(".")) {
								return;
							}
							callback(fullPath, true);
						} catch {}
					}
				},
			);
			watchers.push(watcher);
		}
	}

	return watchers;
}
