# entr-bun

A Bun port of [entr](https://eradman.com/entrproject/) - run arbitrary commands when files change.

## Installation

### From GitHub
```bash
bun add github:nitsanavni/entr-bun-port
```

### Or clone and use locally
```bash
git clone https://github.com/nitsanavni/entr-bun-port.git
cd entr-bun-port
bun install
```

## Usage

```bash
# Watch files and run command on change
ls *.js | bun run index.ts echo "Files changed!"

# Automatically watch all git tracked files (default when no stdin)
bun run index.ts echo "Git files changed!"

# Clear screen before each run
find . -name "*.ts" | bun run index.ts -c npm test

# Restart a server on file changes
ls *.ts | bun run index.ts -r bun server.ts

# Run shell commands
ls *.md | bun run index.ts -s 'make && make test'

# Use /_ placeholder for changed file
ls *.txt | bun run index.ts echo "Changed: /_"
```

## Options

- `-a` - Respond to all events while utility is running
- `-c` - Clear screen before invoking utility (use twice for scrollback)
- `-d` - Track directories and exit if new file is added (use twice for dotfiles)
- `-n` - Run in non-interactive mode
- `-p` - Postpone first execution until file is modified
- `-r` - Reload persistent child process
- `-s` - Evaluate first argument using shell
- `-z` - Exit after utility completes

## Interactive Commands

- `Space` - Execute the utility immediately
- `q` - Quit (equivalent to Ctrl-C)

## Features

- File watching with automatic command execution
- **Automatic git file detection** - defaults to watching all git tracked files when no stdin provided
- Directory watching with new file detection
- Process restarting for servers/daemons
- Shell command evaluation
- Interactive and non-interactive modes
- File path placeholder replacement
- Handles both 'change' and 'rename' file system events for better compatibility

Built with [Bun](https://bun.sh) - a fast all-in-one JavaScript runtime.
