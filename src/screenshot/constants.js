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
			"Screen",
			"Window",
			"Area",
		],

	},
	EXT_IMG: {
		includePointer: true,
		modes: [
			"Screen",
			"Area",
		],
	},
	ZWLR: {
		includePointer: true,
		modes: [
			"Screen",
			"Area",
		],
	},
	SHELL: {
		includePointer: true,
		modes: [
			"Screen",
			"Window",
			"Area",
		],
	},
	PORTAL: {
		includePointer: false,
		modes: [
			"Screen",
			"Area",
		],
	},
}
