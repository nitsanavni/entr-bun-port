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
			console.error(`[DEBUG] File watcher event: ${eventType} on ${file}`);
			if (eventType === "change" || eventType === "rename") {
				console.error(`[DEBUG] Triggering callback for file: ${file}`);
				callback(file);
			}
		});
		watchers.push(watcher);
		console.error(`[DEBUG] Watching file: ${file}`);
	}

	if (options.directories) {
		for (const dir of options.watchedDirs) {
			const watcher = watch(
				dir,
				{ recursive: false },
				(eventType, filename) => {
					console.error(
						`[DEBUG] Directory watcher event: ${eventType} in ${dir}, filename: ${filename}`,
					);
					if (eventType === "rename" && filename) {
						const fullPath = resolve(dir, filename);
						try {
							statSync(fullPath);
							console.error(`[DEBUG] New file detected: ${fullPath}`);
							if (!options.directoriesTwice && filename.startsWith(".")) {
								console.error(`[DEBUG] Ignoring dotfile: ${filename}`);
								return;
							}
							console.error(
								`[DEBUG] Triggering callback for new file: ${fullPath}`,
							);
							callback(fullPath, true);
						} catch {
							console.error(
								`[DEBUG] File no longer exists or cannot stat: ${fullPath}`,
							);
						}
					}
				},
			);
			watchers.push(watcher);
			console.error(`[DEBUG] Watching directory: ${dir}`);
		}
	}

	return watchers;
}
