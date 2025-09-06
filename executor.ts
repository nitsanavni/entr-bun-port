import { resolve } from "node:path";
import createDebug from "debug";
import type { Options } from "./types";

const debug = createDebug("entr:executor");

let currentProcess: ReturnType<typeof Bun.spawn> | null = null;
let shouldExit = false;

export function clearScreen(options: Options) {
	if (options.clear) {
		if (options.clearTwice) {
			debug("Clearing screen with full buffer clear");
			process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
		} else {
			debug("Clearing screen");
			process.stdout.write("\x1b[2J\x1b[H");
		}
	}
}

export async function executeCommand(options: Options, triggeredFile?: string) {
	debug(
		`Executing command: ${options.command.join(" ")}${triggeredFile ? ` (triggered by: ${triggeredFile})` : ""}`,
	);

	if (currentProcess && options.restart) {
		debug("Killing existing process before restart");
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
		debug(`Replacing /_ placeholder with: ${fileToUse}`);
		commandToRun = commandToRun.map((arg) => (arg === "/_" ? fileToUse : arg));
	}

	if (options.shell) {
		const shell = process.env.SHELL || "/bin/sh";
		debug(`Running command in shell: ${shell}`);
		currentProcess = Bun.spawn([shell, "-c", commandToRun.join(" ")], {
			stdin: options.nonInteractive ? "ignore" : "inherit",
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, PAGER: process.env.PAGER || "/bin/cat" },
		});
	} else {
		debug(`Running command directly: ${commandToRun.join(" ")}`);
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
		debug(`Command exited with code: ${exitCode}`);
	} catch (err) {
		debug(`Command failed: ${err}`);
		console.error(`Command failed: ${err}`);
		exitCode = 1;
	}

	if (options.shell && process.stdout.isTTY) {
		console.log(`\n[${process.env.SHELL || "/bin/sh"}] exit: ${exitCode}`);
	}

	if (options.exit) {
		debug(`Exiting after command completion with code: ${exitCode}`);
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
		debug("Killing current process");
		currentProcess.kill();
	} else {
		debug("No current process to kill");
	}
}

export function getShouldExit() {
	return shouldExit;
}
