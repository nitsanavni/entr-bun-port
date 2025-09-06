#!/usr/bin/env bun

import { watch } from "fs";
import { stat, statSync } from "fs";
import { dirname, resolve } from "path";

const args = Bun.argv.slice(2);

interface Options {
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
    watchedDirs: new Set()
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
        case 'c': 
          if (options.clear) options.clearTwice = true;
          options.clear = true; 
          break;
        case 'd': 
          if (options.directories) options.directoriesTwice = true;
          options.directories = true; 
          break;
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
  const files: string[] = [];
  let buffer = "";
  
  for await (const chunk of Bun.stdin.stream()) {
    buffer += Buffer.from(chunk).toString();
  }
  
  const lines = buffer.split('\n').filter(line => line.trim());
  return lines;
}

let currentProcess: any = null;
let shouldExit = false;

async function clearScreen(options: Options) {
  if (options.clear) {
    if (options.clearTwice) {
      process.stdout.write('\x1b[3J\x1b[2J\x1b[H');
    } else {
      process.stdout.write('\x1b[2J\x1b[H');
    }
  }
}

async function executeCommand(options: Options, triggeredFile?: string) {
  if (currentProcess && options.restart) {
    try {
      currentProcess.kill("SIGTERM");
      await currentProcess.exited;
    } catch {}
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
    currentProcess = Bun.spawn([shell, '-c', commandToRun.join(' ')], {
      stdin: options.nonInteractive ? "ignore" : "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, PAGER: process.env.PAGER || '/bin/cat' }
    });
  } else {
    currentProcess = Bun.spawn(commandToRun, {
      stdin: options.nonInteractive ? "ignore" : "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, PAGER: process.env.PAGER || '/bin/cat' }
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
    console.log(`\n[${process.env.SHELL || '/bin/sh'}] exit: ${exitCode}`);
  }
  
  if (options.exit) {
    shouldExit = true;
    process.exit(exitCode);
  }
  
  currentProcess = null;
  return exitCode;
}

function setupWatchers(options: Options, callback: (file: string, isNew?: boolean) => void) {
  const watchers: any[] = [];
  
  for (const file of options.files) {
    const watcher = watch(file, (eventType, filename) => {
      if (eventType === 'change') {
        callback(file);
      }
    });
    watchers.push(watcher);
  }
  
  if (options.directories) {
    for (const dir of options.watchedDirs) {
      const watcher = watch(dir, { recursive: false }, (eventType, filename) => {
        if (eventType === 'rename' && filename) {
          const fullPath = resolve(dir, filename);
          try {
            statSync(fullPath);
            if (!options.directoriesTwice && filename.startsWith('.')) {
              return;
            }
            callback(fullPath, true);
          } catch {}
        }
      });
      watchers.push(watcher);
    }
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
  
  const existingFiles: string[] = [];
  const dirsToWatch = new Set<string>();
  
  for (const file of options.files) {
    try {
      const fileStat = statSync(file);
      if (fileStat.isDirectory()) {
        if (options.directories) {
          dirsToWatch.add(resolve(file));
        } else {
          console.error(`Warning: ${file} is a directory (use -d flag to watch directories)`);
        }
      } else if (fileStat.isFile()) {
        existingFiles.push(file);
        if (options.directories) {
          dirsToWatch.add(dirname(resolve(file)));
        }
      }
    } catch {
      console.error(`Warning: ${file} does not exist`);
    }
  }
  
  options.watchedDirs = dirsToWatch;
  
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
  
  const watchers = setupWatchers(options, async (file, isNew) => {
    if (isNew && options.directories) {
      console.error(`\nentr: directory altered`);
      if (currentProcess) {
        currentProcess.kill();
      }
      process.exit(2);
    }
    
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
  
  if (!options.nonInteractive && process.stdin.isTTY) {
    try {
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
    } catch (err) {
      console.error("Warning: Could not set up keyboard input");
    }
  }
  
  process.on('SIGINT', () => {
    if (currentProcess) {
      currentProcess.kill();
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
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