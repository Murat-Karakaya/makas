import { CaptureMode, CaptureBackend, DefaultCliSettings } from './screenshot/constants.js';
import { settings } from './screenshot/utils.js';

const defaultBackend = settings.get_string("capture-backend-auto").toLowerCase();
const options = {
  mode: null,
  includePointer: false,
  backend: defaultBackend,
  delay: null,
  clipboard: false,
  file: null,
  interactive: false,
  exit: false,
  disableFallback: false,
  notification: false,
  gjsArgv: null, //This will be immediately filled by parseCli
};
export function parseCLI(argv) {
    const args = argv.slice(1);

    options.gjsArgv = [argv[0]];

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
          options.clipboard = true;
          break;
        case('--window'):case('-w'):
          if (options.mode) {
            const oldFlag = options.mode === CaptureMode.WINDOW ? '--window/-w' : '--area/-a';
            print(`[Makas] Warning: Flag '${arg}' overrides previously set mode flag: ${oldFlag}`);
          }
          options.mode = CaptureMode.WINDOW;
          break;
        case('--area'):case('-a'):
          if (options.mode) {
            const oldFlag = options.mode === CaptureMode.WINDOW ? '--window/-w' : '--area/-a';
            print(`[Makas] Warning: Flag '${arg}' overrides previously set mode flag: ${oldFlag}`);
          }
          options.mode = CaptureMode.AREA;
          break;
        case('--include-pointer'):case('-p'):
          options.includePointer = true;
          break
        case('--delay'):case('-d'):
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
          }
          options.backend = resolvedBackend;
          options.disableFallback = true;
          break;
        case ('--notification'):case ('-n'):
          options.notification = true;
          break;
        default:
          options.gjsArgv.push(arg);
          break;
      }
    }

    if (options.exit) return options;

    if (options.interactive) {
        const ignoredFlags = [];
        if (options.mode) ignoredFlags.push(options.mode === CaptureMode.WINDOW ? '--window/-w' : '--area/-a');
        if (options.includePointer) ignoredFlags.push('--include-pointer/-p');
        if (options.backend) ignoredFlags.push('--backend/-b');
        if (options.delay !== null) ignoredFlags.push('--delay/-d');
        if (options.clipboard) ignoredFlags.push('--clipboard/-c');
        if (options.file) ignoredFlags.push('--file/-f');
        if (options.notification) ignoredFlags.push('--notification/-n');

        if (ignoredFlags.length > 0) {
            print(`[Makas] Warning: The following flag(s) are ignored in interactive session: ${ignoredFlags.join(', ')}`);
        }
    }

    for (const key in options) {
      options[key] = options[key] !== null ? options[key] : DefaultCliSettings[key];
    }
    options.backend = options.backend.toUpperCase(); //Set to uppercase so our functions recognize them

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
    -d, --delay=seconds            Take screenshot after specified delay [in seconds]. Default: ${DefaultCliSettings.delay}
    -i, --interactive              Interactively set options
    -n, --notification             Show notification after screenshot is taken
    -f, --file=filename            Save screenshot directly to this file. Default: ${DefaultCliSettings.file === null ? 'none' : DefaultCliSettings.file}
    --version                      Print version information and exit
    -b, --backend=backend          Select backend temporarily (${Object.keys(CaptureBackend).join(', ').toLowerCase()}) Default: ${defaultBackend}
  `);
}
