#!/usr/bin/env bun

import { spawn } from "bun";
import { watch } from "fs";

const args = process.argv.slice(2);

interface Options {
  all: boolean;
  clear: boolean;
  directories: boolean;
  nonInteractive: boolean;
  postpone: boolean;
  restart: boolean;
  shell: boolean;
  exit: boolean;
  command: string[];
  files: string[];
}

function printUsage() {
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

function parseArguments(): Options {
  const options: Options = {
    all: false,
    clear: false,
    directories: false,
    nonInteractive: false,
    postpone: false,
    restart: false,
    shell: false,
    exit: false,
    command: [],
    files: []
  };

  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const flag = args[i];
    
    if (flag === '--') {
      i++;
      break;
    }
    
    for (let j = 1; j < flag.length; j++) {
      switch (flag[j]) {
        case 'a': options.all = true; break;
        case 'c': options.clear = true; break;
        case 'd': options.directories = true; break;
        case 'n': options.nonInteractive = true; break;
        case 'p': options.postpone = true; break;
        case 'r': options.restart = true; break;
        case 's': options.shell = true; break;
        case 'z': options.exit = true; break;
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

async function readFilesFromStdin(): Promise<string[]> {
  const decoder = new TextDecoder();
  const files: string[] = [];
  
  for await (const chunk of Bun.stdin.stream()) {
    const text = decoder.decode(chunk);
    const lines = text.split('\n').filter(line => line.trim());
    files.push(...lines);
  }
  
  return files;
}

let currentProcess: any = null;
let shouldExit = false;

async function clearScreen(options: Options) {
  if (options.clear) {
    process.stdout.write('\x1b[2J\x1b[H');
  }
}

async function executeCommand(options: Options, triggeredFile?: string) {
  if (currentProcess && options.restart) {
    currentProcess.kill("SIGTERM");
    await currentProcess.exited;
    currentProcess = null;
  }
  
  clearScreen(options);
  
  let commandToRun = [...options.command];
  
  if (commandToRun.includes('/_')) {
    const fileToUse = triggeredFile || options.files[0];
    commandToRun = commandToRun.map(arg => 
      arg === '/_' ? fileToUse : arg
    );
  }
  
  if (options.shell) {
    const shell = process.env.SHELL || '/bin/sh';
    currentProcess = spawn({
      cmd: [shell, '-c', commandToRun.join(' ')],
      stdin: options.nonInteractive ? "ignore" : "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
  } else {
    currentProcess = spawn({
      cmd: commandToRun,
      stdin: options.nonInteractive ? "ignore" : "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
  }
  
  const exitCode = await currentProcess.exited;
  
  if (options.shell && process.stdout.isTTY) {
    console.log(`\n[${process.env.SHELL || '/bin/sh'}] exit: ${exitCode}`);
  }
  
  if (options.exit) {
    shouldExit = true;
    process.exit(exitCode);
  }
  
  currentProcess = null;
  return exitCode;
}

function setupWatchers(files: string[], callback: (file: string) => void) {
  const watchers: any[] = [];
  
  for (const file of files) {
    const watcher = watch(file, (eventType, filename) => {
      if (eventType === 'change') {
        callback(file);
      }
    });
    watchers.push(watcher);
  }
  
  return watchers;
}

async function main() {
  const options = parseArguments();
  
  if (!process.stdin.isTTY) {
    options.files = await readFilesFromStdin();
  }
  
  if (options.files.length === 0) {
    console.error("No files provided");
    process.exit(1);
  }
  
  const existingFiles = options.files.filter(file => {
    try {
      const stat = Bun.file(file);
      return true;
    } catch {
      console.error(`Warning: ${file} does not exist`);
      return false;
    }
  });
  
  if (existingFiles.length === 0) {
    console.error("No valid files to watch");
    process.exit(1);
  }
  
  options.files = existingFiles;
  
  if (!options.postpone) {
    await executeCommand(options);
  }
  
  console.error(`Watching ${options.files.length} file(s)...`);
  
  let lastExecutionTime = 0;
  const debounceDelay = options.all ? 0 : 100;
  
  const watchers = setupWatchers(options.files, async (file) => {
    const now = Date.now();
    
    if (!options.all && currentProcess) {
      return;
    }
    
    if (now - lastExecutionTime < debounceDelay) {
      return;
    }
    
    lastExecutionTime = now;
    await executeCommand(options, file);
  });
  
  if (!options.nonInteractive) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', async (key) => {
      const char = key.toString();
      
      if (char === ' ') {
        await executeCommand(options);
      } else if (char === 'q' || char === '\x03') {
        if (currentProcess) {
          currentProcess.kill();
        }
        process.exit(0);
      }
    });
  }
  
  process.on('SIGINT', () => {
    if (currentProcess) {
      currentProcess.kill();
    }
    process.exit(0);
  });
  
  await new Promise(() => {});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});