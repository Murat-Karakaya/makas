export const CaptureMode = {
    SCREEN: "SCREEN",
    WINDOW: "WINDOW",
    AREA: "AREA",
};


export const CaptureBackend = {
    X11: "X11",
    EXT_IMG: "EXT_IMG",
    ZWLR: "ZWLR",
    SHELL: "SHELL",
    PORTAL: "PORTAL",
};

export const SOURCE_PATH = "/com/github/murat/karakaya/Makas";

export const BackendSupport = {
	X11: {
		includePointer: true,
		modes: [
			"SCREEN",
			"WINDOW",
			"AREA",
		],

	},
	EXT_IMG: {
		includePointer: true,
		modes: [
			"SCREEN",
			"AREA",
		],
	},
	ZWLR: {
		includePointer: true,
		modes: [
			"SCREEN",
			"AREA",
		],
	},
	SHELL: {
		includePointer: true,
		modes: [
			"SCREEN",
			"WINDOW",
			"AREA",
		],
	},
	PORTAL: {
		includePointer: false,
		modes: [
			"SCREEN",
			"AREA",
		],
	},
}

export const DefaultCliSettings = {
  mode: CaptureMode.SCREEN,
  includePointer: false,
  delay: 0,
  clipboard: false,
  file: null,
  interactive: false,
  notification: false,
}
