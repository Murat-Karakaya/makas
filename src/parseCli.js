import { CaptureMode, CaptureBackend } from './screenshot/constants.js';

export function parseCLI(argv) {
    const args = argv.slice(1);
    const options = {
        action: null,
        mode: null,
        includePointer: false,
        pointerSet: false,
        backend: null,
        delay: null,
        clipboard: false,
        file: null,
        interactive: false,
        exit: false,
        settingsToSet: [],
        gjsArgv: [argv[0]]
    };

    const resolveBackend = (name) => {
        const lower = name.toLowerCase();
        for (const key in CaptureBackend) {
            if (key.toLowerCase() === lower) {
                return key;
            }
        }
        return false;
    };

    const isFlag = (arg) => arg.startsWith('-');

    // Check if we have any args that determine action, otherwise default to capture
    // But we need to parse first.

    for (let i = 0; i < args.length; i++) {
        let arg = args[i];
        let afterEquals = null;

        if (arg === '--') continue;

        // Handle --param=value syntax
        if (arg.startsWith('--') && arg.includes('=')) {
            const parts = arg.split('=');
            arg = parts[0];
            afterEquals = parts.slice(1).join('=');
        }

      switch (arg) {
        case('--help'):case('-h'):
          printHelp();
          options.exit = true;
          return options;
        case('--version'):
          print(`Makas ${pkg.version}`);
          options.exit = true;
          return options;
        case('--clipboard'):case('-c'):
          options.action = 'capture';
          options.clipboard = true;
          break;
        case('--window'):case('-w'):
          options.action = 'capture';
          if (options.mode) {
            const oldFlag = options.mode === CaptureMode.WINDOW ? '--window/-w' : '--area/-a';
            print(`[Makas] Warning: Flag '${arg}' overrides previously set mode flag: ${oldFlag}`);
          }
          options.mode = CaptureMode.WINDOW;
          break;
        case('--area'):case('-a'):
          options.action = 'capture';
          if (options.mode) {
            const oldFlag = options.mode === CaptureMode.WINDOW ? '--window/-w' : '--area/-a';
            print(`[Makas] Warning: Flag '${arg}' overrides previously set mode flag: ${oldFlag}`);
          }
          options.mode = CaptureMode.AREA;
          break;
        case('--include-pointer'):case('-p'):
          options.includePointer = true;
          options.pointerSet = true;
          break
        case('--delay'):case('-d'):
					options.action = 'capture';
					let delayVal = null;
          if (afterEquals) {
            delayVal = afterEquals;
          } else if (i + 1 < args.length && !isFlag(args[i+1])) {
            delayVal = args[++i];
          } else {
            print(`[Makas] Error: Argument '${arg}' requires a value (seconds).`);
            options.exit = true;
            break;
          }
          const parsedDelay = Number(delayVal);
          if (Number.isNaN(parsedDelay) || !Number.isInteger(parsedDelay) || parsedDelay < 0) {
            print(`[Makas] Error: Argument '${arg}' requires a non-negative integer (number of seconds). Received: '${delayVal}'`);
            options.exit = true;
          } else {
            options.delay = parsedDelay;
          }
          break
        case ('--interactive'):case('-i'):
          options.interactive = true;
          break;
        case('--file'): case('-f'):
          options.action = 'capture';

          //Filename validation checks are done in cli.js to prevent check operations from hurting performance

          if (afterEquals) {
            options.file = afterEquals;
            break;
          }
          if (i + 1 < args.length && !isFlag(args[i+1])) {
            options.file = args[++i];
            break;
          }
          print(`[Makas] Error: Argument '${arg}' requires a filename string.`);
          options.exit = true;
          break;
        case ('--backend'):case ('-b'):
          let backendVal = null;
          if (afterEquals) {
            backendVal = afterEquals;
          } else if (i + 1 < args.length && !isFlag(args[i+1])) {
            backendVal = args[++i];
          } else {
            print(`[Makas] Error: Argument '${arg}' requires a backend name.`);
            options.exit = true;
            break;
          }
          const resolvedBackend = resolveBackend(backendVal);
          if (!resolvedBackend) {
            const allowedBackends = Object.keys(CaptureBackend).join(', ').toLowerCase();
            print(`[Makas] Error: Argument '${arg}' requires a valid backend type (one of: ${allowedBackends}). Received: '${backendVal}'`);
            options.exit = true;
          } else {
            options.backend = resolvedBackend;
          }
          break;
        default:
          options.gjsArgv.push(arg);
          break;
      }
    }

    if (options.exit) return options;

    if (options.interactive) {
        options.action = null; // Forces main.js to use win.present() (PreScreenshot)
        const ignoredFlags = [];
        if (options.mode) ignoredFlags.push(options.mode === CaptureMode.WINDOW ? '--window/-w' : '--area/-a');
        if (options.pointerSet) ignoredFlags.push('--include-pointer/-p');
        if (options.backend) ignoredFlags.push('--backend/-b');
        if (options.delay !== null) ignoredFlags.push('--delay/-d');
        if (options.clipboard) ignoredFlags.push('--clipboard/-c');
        if (options.file) ignoredFlags.push('--file/-f');

        if (ignoredFlags.length > 0) {
            print(`[Makas] Warning: The following flag(s) are ignored in interactive mode: ${ignoredFlags.join(', ')}`);
        }
    } else {
        if (!options.action) {
          options.action = 'capture';
        }
    }

    return options;
}

function printHelp() {
  print(`Usage:
  makas [OPTION...]

  Help Options:
    -h, --help                     Show help options

  Application Options:
    -c, --clipboard                Send the grab directly to the clipboard
    -w, --window                   Grab a window instead of the entire screen
    -a, --area                     Grab an area of the screen instead of the entire screen
    -p, --include-pointer          Include the pointer with the screenshot
    -d, --delay=seconds            Take screenshot after specified delay [in seconds]
    -i, --interactive              Interactively set options
    -f, --file=filename            Save screenshot directly to this file
    --version                      Print version information and exit
    -b, --backend=backend          Select backend temporarily (${Object.keys(CaptureBackend).join(', ').toLowerCase()})
  `);
}
