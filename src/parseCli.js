import { backends } from './screenshot/utils.js';
import { CaptureMode } from './screenshot/constants.js';

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
        for (const key in backends) {
            if (key.toLowerCase() === lower || backends[key].label.toLowerCase().includes(lower)) {
                return key;
            }
        }
        return name;
    };

    const isFlag = (arg) => arg.startsWith('-');

    // Check if we have any args that determine action, otherwise default to capture
    // But we need to parse first.

    for (let i = 0; i < args.length; i++) {
        let arg = args[i];
        let val = null;

        if (arg === '--') continue;

        // Handle --param=value syntax
        if (arg.startsWith('--') && arg.includes('=')) {
            const parts = arg.split('=');
            arg = parts[0];
            val = parts.slice(1).join('=');
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
          options.mode = CaptureMode.WINDOW;
          break;
        case('--area'):case('-a'):
          options.action = 'capture';
          options.mode = CaptureMode.AREA;
          break;
        case('--include-pointer'):case('-p'):
          options.includePointer = true;
          options.pointerSet = true;
          break
        case('--delay'):case('-d'):
					options.action = 'capture';
          if (val) {
            options.delay = parseInt(val, 10);
          } else if (i + 1 < args.length && !isFlag(args[i+1])) {
            options.delay = parseInt(args[++i], 10);
          } else {
            print(`[Makas] Error: Argument '${arg}' requires a value (seconds).`);
            options.exit = true;
          }
          break
        case ('--interactive'):case('-i'):
          options.interactive = true;
          break;
        case('-f'):
          options.action = 'capture';
          if (i + 1 < args.length && !isFlag(args[i+1])) {
            options.file = args[++i];
            break;
          }
          print(`[Makas] Error: Argument '${arg}' requires a filename.`);
          options.exit = true;
          break;
        case ('--backend'):case ('-b'):
          if (val) {
            options.backend = resolveBackend(val);
          } else if (i + 1 < args.length && !isFlag(args[i+1])) {
            options.backend = resolveBackend(args[++i]);
          } else {
            print(`[Makas] Error: Argument '${arg}' requires a backend name.`);
            options.exit = true;
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
    -b, --backend=backend          Select backend temporarily (x11, shell, wayland, portal)
  `);
}
