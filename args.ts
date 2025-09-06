import type { Options } from "./types";

export function printUsage() {
	console.error(`Usage: entr [-acdnprsz] utility [argument /_ ...]
  
Options:
  -a  Respond to all events while utility is running
  -c  Clear screen before invoking utility
  -d  Track directories and exit if new file is added
  -n  Run in non-interactive mode
  -p  Postpone first execution until file is modified
  -r  Reload persistent child process
  -s  Evaluate first argument using shell
  -z  Exit after utility completes`);
	process.exit(1);
}

export function parseArguments(args: string[]): Options {
	const options: Options = {
		all: false,
		clear: false,
		clearTwice: false,
		directories: false,
		directoriesTwice: false,
		nonInteractive: false,
		postpone: false,
		restart: false,
		shell: false,
		exit: false,
		command: [],
		files: [],
		watchedDirs: new Set(),
	};

	let i = 0;
	while (i < args.length && args[i]?.startsWith("-")) {
		const flag = args[i];
		if (!flag) break;

		if (flag === "--") {
			i++;
			break;
		}

		for (let j = 1; j < flag.length; j++) {
			switch (flag[j]) {
				case "a":
					options.all = true;
					break;
				case "c":
					if (options.clear) options.clearTwice = true;
					options.clear = true;
					break;
				case "d":
					if (options.directories) options.directoriesTwice = true;
					options.directories = true;
					break;
				case "n":
					options.nonInteractive = true;
					break;
				case "p":
					options.postpone = true;
					break;
				case "r":
					options.restart = true;
					break;
				case "s":
					options.shell = true;
					break;
				case "z":
					options.exit = true;
					break;
				default:
					console.error(`Unknown option: -${flag[j]}`);
					printUsage();
			}
		}
		i++;
	}

	if (i >= args.length) {
		console.error("No utility specified");
		printUsage();
	}

	options.command = args.slice(i);

	return options;
}
