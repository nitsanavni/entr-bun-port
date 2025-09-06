import { resolve } from "node:path";
import type { Options } from "./types";

let currentProcess: ReturnType<typeof Bun.spawn> | null = null;
let shouldExit = false;

export function clearScreen(options: Options) {
	if (options.clear) {
		if (options.clearTwice) {
			console.error("[DEBUG] Clearing screen with full buffer clear");
			process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
		} else {
			console.error("[DEBUG] Clearing screen");
			process.stdout.write("\x1b[2J\x1b[H");
		}
	}
}

export async function executeCommand(options: Options, triggeredFile?: string) {
	console.error(
		`[DEBUG] Executing command: ${options.command.join(" ")}${triggeredFile ? ` (triggered by: ${triggeredFile})` : ""}`,
	);

	if (currentProcess && options.restart) {
		console.error("[DEBUG] Killing existing process before restart");
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
		console.error(`[DEBUG] Replacing /_ placeholder with: ${fileToUse}`);
		commandToRun = commandToRun.map((arg) => (arg === "/_" ? fileToUse : arg));
	}

	if (options.shell) {
		const shell = process.env.SHELL || "/bin/sh";
		console.error(`[DEBUG] Running command in shell: ${shell}`);
		currentProcess = Bun.spawn([shell, "-c", commandToRun.join(" ")], {
			stdin: options.nonInteractive ? "ignore" : "inherit",
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, PAGER: process.env.PAGER || "/bin/cat" },
		});
	} else {
		console.error(
			`[DEBUG] Running command directly: ${commandToRun.join(" ")}`,
		);
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
		console.error(`[DEBUG] Command exited with code: ${exitCode}`);
	} catch (err) {
		console.error(`[DEBUG] Command failed: ${err}`);
		console.error(`Command failed: ${err}`);
		exitCode = 1;
	}

	if (options.shell && process.stdout.isTTY) {
		console.log(`\n[${process.env.SHELL || "/bin/sh"}] exit: ${exitCode}`);
	}

	if (options.exit) {
		console.error(
			`[DEBUG] Exiting after command completion with code: ${exitCode}`,
		);
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
		console.error("[DEBUG] Killing current process");
		currentProcess.kill();
	} else {
		console.error("[DEBUG] No current process to kill");
	}
}

export function getShouldExit() {
	return shouldExit;
}
