import { resolve } from "node:path";
import type { Options } from "./types";

let currentProcess: ReturnType<typeof Bun.spawn> | null = null;
let shouldExit = false;

export function clearScreen(options: Options) {
	if (options.clear) {
		if (options.clearTwice) {
			process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
		} else {
			process.stdout.write("\x1b[2J\x1b[H");
		}
	}
}

export async function executeCommand(options: Options, triggeredFile?: string) {
	if (currentProcess && options.restart) {
		try {
			currentProcess.kill("SIGTERM");
			await currentProcess.exited;
		} catch {}
		currentProcess = null;
	}

	clearScreen(options);

	let commandToRun = [...options.command];

	if (commandToRun.includes("/_")) {
		const fileToUse = resolve(triggeredFile || options.files[0] || "");
		commandToRun = commandToRun.map((arg) => (arg === "/_" ? fileToUse : arg));
	}

	if (options.shell) {
		const shell = process.env.SHELL || "/bin/sh";
		currentProcess = Bun.spawn([shell, "-c", commandToRun.join(" ")], {
			stdin: options.nonInteractive ? "ignore" : "inherit",
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, PAGER: process.env.PAGER || "/bin/cat" },
		});
	} else {
		currentProcess = Bun.spawn(commandToRun, {
			stdin: options.nonInteractive ? "ignore" : "inherit",
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, PAGER: process.env.PAGER || "/bin/cat" },
		});
	}

	let exitCode = 0;
	try {
		exitCode = await currentProcess.exited;
	} catch (err) {
		console.error(`Command failed: ${err}`);
		exitCode = 1;
	}

	if (options.shell && process.stdout.isTTY) {
		console.log(`\n[${process.env.SHELL || "/bin/sh"}] exit: ${exitCode}`);
	}

	if (options.exit) {
		shouldExit = true;
		process.exit(exitCode);
	}

	currentProcess = null;
	return exitCode;
}

export function getCurrentProcess() {
	return currentProcess;
}

export function killCurrentProcess() {
	if (currentProcess) {
		currentProcess.kill();
	}
}

export function getShouldExit() {
	return shouldExit;
}
