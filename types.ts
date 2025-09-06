export interface Options {
	all: boolean;
	clear: boolean;
	clearTwice: boolean;
	directories: boolean;
	directoriesTwice: boolean;
	nonInteractive: boolean;
	postpone: boolean;
	restart: boolean;
	shell: boolean;
	exit: boolean;
	command: string[];
	files: string[];
	watchedDirs: Set<string>;
}
