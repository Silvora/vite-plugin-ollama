import 'fs/promises';
import process$2 from 'node:process';
import http from 'node:http';
import 'node:https';
import 'node:zlib';
import Stream from 'node:stream';
import { Buffer } from 'node:buffer';
import { promisify, deprecate, types } from 'node:util';
import 'node:url';
import 'node:net';
import 'node:fs';
import 'node:path';

const ANSI_BACKGROUND_OFFSET = 10;

const wrapAnsi16 = (offset = 0) => code => `\u001B[${code + offset}m`;

const wrapAnsi256 = (offset = 0) => code => `\u001B[${38 + offset};5;${code}m`;

const wrapAnsi16m = (offset = 0) => (red, green, blue) => `\u001B[${38 + offset};2;${red};${green};${blue}m`;

const styles$1 = {
	modifier: {
		reset: [0, 0],
		// 21 isn't widely supported and 22 does the same thing
		bold: [1, 22],
		dim: [2, 22],
		italic: [3, 23],
		underline: [4, 24],
		overline: [53, 55],
		inverse: [7, 27],
		hidden: [8, 28],
		strikethrough: [9, 29],
	},
	color: {
		black: [30, 39],
		red: [31, 39],
		green: [32, 39],
		yellow: [33, 39],
		blue: [34, 39],
		magenta: [35, 39],
		cyan: [36, 39],
		white: [37, 39],

		// Bright color
		blackBright: [90, 39],
		gray: [90, 39], // Alias of `blackBright`
		grey: [90, 39], // Alias of `blackBright`
		redBright: [91, 39],
		greenBright: [92, 39],
		yellowBright: [93, 39],
		blueBright: [94, 39],
		magentaBright: [95, 39],
		cyanBright: [96, 39],
		whiteBright: [97, 39],
	},
	bgColor: {
		bgBlack: [40, 49],
		bgRed: [41, 49],
		bgGreen: [42, 49],
		bgYellow: [43, 49],
		bgBlue: [44, 49],
		bgMagenta: [45, 49],
		bgCyan: [46, 49],
		bgWhite: [47, 49],

		// Bright color
		bgBlackBright: [100, 49],
		bgGray: [100, 49], // Alias of `bgBlackBright`
		bgGrey: [100, 49], // Alias of `bgBlackBright`
		bgRedBright: [101, 49],
		bgGreenBright: [102, 49],
		bgYellowBright: [103, 49],
		bgBlueBright: [104, 49],
		bgMagentaBright: [105, 49],
		bgCyanBright: [106, 49],
		bgWhiteBright: [107, 49],
	},
};

Object.keys(styles$1.modifier);
const foregroundColorNames = Object.keys(styles$1.color);
const backgroundColorNames = Object.keys(styles$1.bgColor);
[...foregroundColorNames, ...backgroundColorNames];

function assembleStyles() {
	const codes = new Map();

	for (const [groupName, group] of Object.entries(styles$1)) {
		for (const [styleName, style] of Object.entries(group)) {
			styles$1[styleName] = {
				open: `\u001B[${style[0]}m`,
				close: `\u001B[${style[1]}m`,
			};

			group[styleName] = styles$1[styleName];

			codes.set(style[0], style[1]);
		}

		Object.defineProperty(styles$1, groupName, {
			value: group,
			enumerable: false,
		});
	}

	Object.defineProperty(styles$1, 'codes', {
		value: codes,
		enumerable: false,
	});

	styles$1.color.close = '\u001B[39m';
	styles$1.bgColor.close = '\u001B[49m';

	styles$1.color.ansi = wrapAnsi16();
	styles$1.color.ansi256 = wrapAnsi256();
	styles$1.color.ansi16m = wrapAnsi16m();
	styles$1.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
	styles$1.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
	styles$1.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);

	// From https://github.com/Qix-/color-convert/blob/3f0e0d4e92e235796ccb17f6e85c72094a651f49/conversions.js
	Object.defineProperties(styles$1, {
		rgbToAnsi256: {
			value(red, green, blue) {
				// We use the extended greyscale palette here, with the exception of
				// black and white. normal palette only has 4 greyscale shades.
				if (red === green && green === blue) {
					if (red < 8) {
						return 16;
					}

					if (red > 248) {
						return 231;
					}

					return Math.round(((red - 8) / 247) * 24) + 232;
				}

				return 16
					+ (36 * Math.round(red / 255 * 5))
					+ (6 * Math.round(green / 255 * 5))
					+ Math.round(blue / 255 * 5);
			},
			enumerable: false,
		},
		hexToRgb: {
			value(hex) {
				const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
				if (!matches) {
					return [0, 0, 0];
				}

				let [colorString] = matches;

				if (colorString.length === 3) {
					colorString = [...colorString].map(character => character + character).join('');
				}

				const integer = Number.parseInt(colorString, 16);

				return [
					/* eslint-disable no-bitwise */
					(integer >> 16) & 0xFF,
					(integer >> 8) & 0xFF,
					integer & 0xFF,
					/* eslint-enable no-bitwise */
				];
			},
			enumerable: false,
		},
		hexToAnsi256: {
			value: hex => styles$1.rgbToAnsi256(...styles$1.hexToRgb(hex)),
			enumerable: false,
		},
		ansi256ToAnsi: {
			value(code) {
				if (code < 8) {
					return 30 + code;
				}

				if (code < 16) {
					return 90 + (code - 8);
				}

				let red;
				let green;
				let blue;

				if (code >= 232) {
					red = (((code - 232) * 10) + 8) / 255;
					green = red;
					blue = red;
				} else {
					code -= 16;

					const remainder = code % 36;

					red = Math.floor(code / 36) / 5;
					green = Math.floor(remainder / 6) / 5;
					blue = (remainder % 6) / 5;
				}

				const value = Math.max(red, green, blue) * 2;

				if (value === 0) {
					return 30;
				}

				// eslint-disable-next-line no-bitwise
				let result = 30 + ((Math.round(blue) << 2) | (Math.round(green) << 1) | Math.round(red));

				if (value === 2) {
					result += 60;
				}

				return result;
			},
			enumerable: false,
		},
		rgbToAnsi: {
			value: (red, green, blue) => styles$1.ansi256ToAnsi(styles$1.rgbToAnsi256(red, green, blue)),
			enumerable: false,
		},
		hexToAnsi: {
			value: hex => styles$1.ansi256ToAnsi(styles$1.hexToAnsi256(hex)),
			enumerable: false,
		},
	});

	return styles$1;
}

const ansiStyles = assembleStyles();

/* eslint-env browser */

const level = (() => {
	if (navigator.userAgentData) {
		const brand = navigator.userAgentData.brands.find(({brand}) => brand === 'Chromium');
		if (brand && brand.version > 93) {
			return 3;
		}
	}

	if (/\b(Chrome|Chromium)\//.test(navigator.userAgent)) {
		return 1;
	}

	return 0;
})();

const colorSupport = level !== 0 && {
	level,
	hasBasic: true,
	has256: level >= 2,
	has16m: level >= 3,
};

const supportsColor = {
	stdout: colorSupport,
	stderr: colorSupport,
};

// TODO: When targeting Node.js 16, use `String.prototype.replaceAll`.
function stringReplaceAll(string, substring, replacer) {
	let index = string.indexOf(substring);
	if (index === -1) {
		return string;
	}

	const substringLength = substring.length;
	let endIndex = 0;
	let returnValue = '';
	do {
		returnValue += string.slice(endIndex, index) + substring + replacer;
		endIndex = index + substringLength;
		index = string.indexOf(substring, endIndex);
	} while (index !== -1);

	returnValue += string.slice(endIndex);
	return returnValue;
}

function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
	let endIndex = 0;
	let returnValue = '';
	do {
		const gotCR = string[index - 1] === '\r';
		returnValue += string.slice(endIndex, (gotCR ? index - 1 : index)) + prefix + (gotCR ? '\r\n' : '\n') + postfix;
		endIndex = index + 1;
		index = string.indexOf('\n', endIndex);
	} while (index !== -1);

	returnValue += string.slice(endIndex);
	return returnValue;
}

const {stdout: stdoutColor, stderr: stderrColor} = supportsColor;

const GENERATOR = Symbol('GENERATOR');
const STYLER = Symbol('STYLER');
const IS_EMPTY = Symbol('IS_EMPTY');

// `supportsColor.level` → `ansiStyles.color[name]` mapping
const levelMapping = [
	'ansi',
	'ansi',
	'ansi256',
	'ansi16m',
];

const styles = Object.create(null);

const applyOptions = (object, options = {}) => {
	if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
		throw new Error('The `level` option should be an integer from 0 to 3');
	}

	// Detect level if not set manually
	const colorLevel = stdoutColor ? stdoutColor.level : 0;
	object.level = options.level === undefined ? colorLevel : options.level;
};

const chalkFactory = options => {
	const chalk = (...strings) => strings.join(' ');
	applyOptions(chalk, options);

	Object.setPrototypeOf(chalk, createChalk.prototype);

	return chalk;
};

function createChalk(options) {
	return chalkFactory(options);
}

Object.setPrototypeOf(createChalk.prototype, Function.prototype);

for (const [styleName, style] of Object.entries(ansiStyles)) {
	styles[styleName] = {
		get() {
			const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
			Object.defineProperty(this, styleName, {value: builder});
			return builder;
		},
	};
}

styles.visible = {
	get() {
		const builder = createBuilder(this, this[STYLER], true);
		Object.defineProperty(this, 'visible', {value: builder});
		return builder;
	},
};

const getModelAnsi = (model, level, type, ...arguments_) => {
	if (model === 'rgb') {
		if (level === 'ansi16m') {
			return ansiStyles[type].ansi16m(...arguments_);
		}

		if (level === 'ansi256') {
			return ansiStyles[type].ansi256(ansiStyles.rgbToAnsi256(...arguments_));
		}

		return ansiStyles[type].ansi(ansiStyles.rgbToAnsi(...arguments_));
	}

	if (model === 'hex') {
		return getModelAnsi('rgb', level, type, ...ansiStyles.hexToRgb(...arguments_));
	}

	return ansiStyles[type][model](...arguments_);
};

const usedModels = ['rgb', 'hex', 'ansi256'];

for (const model of usedModels) {
	styles[model] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler(getModelAnsi(model, levelMapping[level], 'color', ...arguments_), ansiStyles.color.close, this[STYLER]);
				return createBuilder(this, styler, this[IS_EMPTY]);
			};
		},
	};

	const bgModel = 'bg' + model[0].toUpperCase() + model.slice(1);
	styles[bgModel] = {
		get() {
			const {level} = this;
			return function (...arguments_) {
				const styler = createStyler(getModelAnsi(model, levelMapping[level], 'bgColor', ...arguments_), ansiStyles.bgColor.close, this[STYLER]);
				return createBuilder(this, styler, this[IS_EMPTY]);
			};
		},
	};
}

const proto = Object.defineProperties(() => {}, {
	...styles,
	level: {
		enumerable: true,
		get() {
			return this[GENERATOR].level;
		},
		set(level) {
			this[GENERATOR].level = level;
		},
	},
});

const createStyler = (open, close, parent) => {
	let openAll;
	let closeAll;
	if (parent === undefined) {
		openAll = open;
		closeAll = close;
	} else {
		openAll = parent.openAll + open;
		closeAll = close + parent.closeAll;
	}

	return {
		open,
		close,
		openAll,
		closeAll,
		parent,
	};
};

const createBuilder = (self, _styler, _isEmpty) => {
	// Single argument is hot path, implicit coercion is faster than anything
	// eslint-disable-next-line no-implicit-coercion
	const builder = (...arguments_) => applyStyle(builder, (arguments_.length === 1) ? ('' + arguments_[0]) : arguments_.join(' '));

	// We alter the prototype because we must return a function, but there is
	// no way to create a function with a different prototype
	Object.setPrototypeOf(builder, proto);

	builder[GENERATOR] = self;
	builder[STYLER] = _styler;
	builder[IS_EMPTY] = _isEmpty;

	return builder;
};

const applyStyle = (self, string) => {
	if (self.level <= 0 || !string) {
		return self[IS_EMPTY] ? '' : string;
	}

	let styler = self[STYLER];

	if (styler === undefined) {
		return string;
	}

	const {openAll, closeAll} = styler;
	if (string.includes('\u001B')) {
		while (styler !== undefined) {
			// Replace any instances already present with a re-opening code
			// otherwise only the part of the string until said closing code
			// will be colored, and the rest will simply be 'plain'.
			string = stringReplaceAll(string, styler.close, styler.open);

			styler = styler.parent;
		}
	}

	// We can move both next actions out of loop, because remaining actions in loop won't have
	// any/visible effect on parts we add here. Close the styling before a linebreak and reopen
	// after next line to fix a bleed issue on macOS: https://github.com/chalk/chalk/pull/92
	const lfIndex = string.indexOf('\n');
	if (lfIndex !== -1) {
		string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
	}

	return openAll + string + closeAll;
};

Object.defineProperties(createChalk.prototype, styles);

const chalk = createChalk();
createChalk({level: stderrColor ? stderrColor.level : 0});

var chalk$1 = chalk;

const copyProperty = (to, from, property, ignoreNonConfigurable) => {
	// `Function#length` should reflect the parameters of `to` not `from` since we keep its body.
	// `Function#prototype` is non-writable and non-configurable so can never be modified.
	if (property === 'length' || property === 'prototype') {
		return;
	}

	// `Function#arguments` and `Function#caller` should not be copied. They were reported to be present in `Reflect.ownKeys` for some devices in React Native (#41), so we explicitly ignore them here.
	if (property === 'arguments' || property === 'caller') {
		return;
	}

	const toDescriptor = Object.getOwnPropertyDescriptor(to, property);
	const fromDescriptor = Object.getOwnPropertyDescriptor(from, property);

	if (!canCopyProperty(toDescriptor, fromDescriptor) && ignoreNonConfigurable) {
		return;
	}

	Object.defineProperty(to, property, fromDescriptor);
};

// `Object.defineProperty()` throws if the property exists, is not configurable and either:
// - one its descriptors is changed
// - it is non-writable and its value is changed
const canCopyProperty = function (toDescriptor, fromDescriptor) {
	return toDescriptor === undefined || toDescriptor.configurable || (
		toDescriptor.writable === fromDescriptor.writable
		&& toDescriptor.enumerable === fromDescriptor.enumerable
		&& toDescriptor.configurable === fromDescriptor.configurable
		&& (toDescriptor.writable || toDescriptor.value === fromDescriptor.value)
	);
};

const changePrototype = (to, from) => {
	const fromPrototype = Object.getPrototypeOf(from);
	if (fromPrototype === Object.getPrototypeOf(to)) {
		return;
	}

	Object.setPrototypeOf(to, fromPrototype);
};

const wrappedToString = (withName, fromBody) => `/* Wrapped ${withName}*/\n${fromBody}`;

const toStringDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, 'toString');
const toStringName = Object.getOwnPropertyDescriptor(Function.prototype.toString, 'name');

// We call `from.toString()` early (not lazily) to ensure `from` can be garbage collected.
// We use `bind()` instead of a closure for the same reason.
// Calling `from.toString()` early also allows caching it in case `to.toString()` is called several times.
const changeToString = (to, from, name) => {
	const withName = name === '' ? '' : `with ${name.trim()}() `;
	const newToString = wrappedToString.bind(null, withName, from.toString());
	// Ensure `to.toString.toString` is non-enumerable and has the same `same`
	Object.defineProperty(newToString, 'name', toStringName);
	const {writable, enumerable, configurable} = toStringDescriptor; // We destructue to avoid a potential `get` descriptor.
	Object.defineProperty(to, 'toString', {value: newToString, writable, enumerable, configurable});
};

function mimicFunction(to, from, {ignoreNonConfigurable = false} = {}) {
	const {name} = to;

	for (const property of Reflect.ownKeys(from)) {
		copyProperty(to, from, property, ignoreNonConfigurable);
	}

	changePrototype(to, from);
	changeToString(to, from, name);

	return to;
}

const calledFunctions = new WeakMap();

const onetime = (function_, options = {}) => {
	if (typeof function_ !== 'function') {
		throw new TypeError('Expected a function');
	}

	let returnValue;
	let callCount = 0;
	const functionName = function_.displayName || function_.name || '<anonymous>';

	const onetime = function (...arguments_) {
		calledFunctions.set(onetime, ++callCount);

		if (callCount === 1) {
			returnValue = function_.apply(this, arguments_);
			function_ = undefined;
		} else if (options.throw === true) {
			throw new Error(`Function \`${functionName}\` can only be called once`);
		}

		return returnValue;
	};

	mimicFunction(onetime, function_);
	calledFunctions.set(onetime, callCount);

	return onetime;
};

onetime.callCount = function_ => {
	if (!calledFunctions.has(function_)) {
		throw new Error(`The given function \`${function_.name}\` is not wrapped by the \`onetime\` package`);
	}

	return calledFunctions.get(function_);
};

var onetime$1 = onetime;

/**
 * This is not the set of all possible signals.
 *
 * It IS, however, the set of all signals that trigger
 * an exit on either Linux or BSD systems.  Linux is a
 * superset of the signal names supported on BSD, and
 * the unknown signals just fail to register, so we can
 * catch that easily enough.
 *
 * Windows signals are a different set, since there are
 * signals that terminate Windows processes, but don't
 * terminate (or don't even exist) on Posix systems.
 *
 * Don't bother with SIGKILL.  It's uncatchable, which
 * means that we can't fire any callbacks anyway.
 *
 * If a user does happen to register a handler on a non-
 * fatal signal like SIGWINCH or something, and then
 * exit, it'll end up firing `process.emit('exit')`, so
 * the handler will be fired anyway.
 *
 * SIGBUS, SIGFPE, SIGSEGV and SIGILL, when not raised
 * artificially, inherently leave the process in a
 * state from which it is not safe to try and enter JS
 * listeners.
 */
const signals = [];
signals.push('SIGHUP', 'SIGINT', 'SIGTERM');
if (process.platform !== 'win32') {
    signals.push('SIGALRM', 'SIGABRT', 'SIGVTALRM', 'SIGXCPU', 'SIGXFSZ', 'SIGUSR2', 'SIGTRAP', 'SIGSYS', 'SIGQUIT', 'SIGIOT'
    // should detect profiler and enable/disable accordingly.
    // see #21
    // 'SIGPROF'
    );
}
if (process.platform === 'linux') {
    signals.push('SIGIO', 'SIGPOLL', 'SIGPWR', 'SIGSTKFLT');
}

// Note: since nyc uses this module to output coverage, any lines
// that are in the direct sync flow of nyc's outputCoverage are
// ignored, since we can never get coverage for them.
// grab a reference to node's real process object right away
const processOk = (process) => !!process &&
    typeof process === 'object' &&
    typeof process.removeListener === 'function' &&
    typeof process.emit === 'function' &&
    typeof process.reallyExit === 'function' &&
    typeof process.listeners === 'function' &&
    typeof process.kill === 'function' &&
    typeof process.pid === 'number' &&
    typeof process.on === 'function';
const kExitEmitter = Symbol.for('signal-exit emitter');
const global$1 = globalThis;
const ObjectDefineProperty = Object.defineProperty.bind(Object);
// teeny special purpose ee
class Emitter {
    emitted = {
        afterExit: false,
        exit: false,
    };
    listeners = {
        afterExit: [],
        exit: [],
    };
    count = 0;
    id = Math.random();
    constructor() {
        if (global$1[kExitEmitter]) {
            return global$1[kExitEmitter];
        }
        ObjectDefineProperty(global$1, kExitEmitter, {
            value: this,
            writable: false,
            enumerable: false,
            configurable: false,
        });
    }
    on(ev, fn) {
        this.listeners[ev].push(fn);
    }
    removeListener(ev, fn) {
        const list = this.listeners[ev];
        const i = list.indexOf(fn);
        /* c8 ignore start */
        if (i === -1) {
            return;
        }
        /* c8 ignore stop */
        if (i === 0 && list.length === 1) {
            list.length = 0;
        }
        else {
            list.splice(i, 1);
        }
    }
    emit(ev, code, signal) {
        if (this.emitted[ev]) {
            return false;
        }
        this.emitted[ev] = true;
        let ret = false;
        for (const fn of this.listeners[ev]) {
            ret = fn(code, signal) === true || ret;
        }
        if (ev === 'exit') {
            ret = this.emit('afterExit', code, signal) || ret;
        }
        return ret;
    }
}
class SignalExitBase {
}
const signalExitWrap = (handler) => {
    return {
        onExit(cb, opts) {
            return handler.onExit(cb, opts);
        },
        load() {
            return handler.load();
        },
        unload() {
            return handler.unload();
        },
    };
};
class SignalExitFallback extends SignalExitBase {
    onExit() {
        return () => { };
    }
    load() { }
    unload() { }
}
class SignalExit extends SignalExitBase {
    // "SIGHUP" throws an `ENOSYS` error on Windows,
    // so use a supported signal instead
    /* c8 ignore start */
    #hupSig = process$1.platform === 'win32' ? 'SIGINT' : 'SIGHUP';
    /* c8 ignore stop */
    #emitter = new Emitter();
    #process;
    #originalProcessEmit;
    #originalProcessReallyExit;
    #sigListeners = {};
    #loaded = false;
    constructor(process) {
        super();
        this.#process = process;
        // { <signal>: <listener fn>, ... }
        this.#sigListeners = {};
        for (const sig of signals) {
            this.#sigListeners[sig] = () => {
                // If there are no other listeners, an exit is coming!
                // Simplest way: remove us and then re-send the signal.
                // We know that this will kill the process, so we can
                // safely emit now.
                const listeners = this.#process.listeners(sig);
                let { count } = this.#emitter;
                // This is a workaround for the fact that signal-exit v3 and signal
                // exit v4 are not aware of each other, and each will attempt to let
                // the other handle it, so neither of them do. To correct this, we
                // detect if we're the only handler *except* for previous versions
                // of signal-exit, and increment by the count of listeners it has
                // created.
                /* c8 ignore start */
                const p = process;
                if (typeof p.__signal_exit_emitter__ === 'object' &&
                    typeof p.__signal_exit_emitter__.count === 'number') {
                    count += p.__signal_exit_emitter__.count;
                }
                /* c8 ignore stop */
                if (listeners.length === count) {
                    this.unload();
                    const ret = this.#emitter.emit('exit', null, sig);
                    /* c8 ignore start */
                    const s = sig === 'SIGHUP' ? this.#hupSig : sig;
                    if (!ret)
                        process.kill(process.pid, s);
                    /* c8 ignore stop */
                }
            };
        }
        this.#originalProcessReallyExit = process.reallyExit;
        this.#originalProcessEmit = process.emit;
    }
    onExit(cb, opts) {
        /* c8 ignore start */
        if (!processOk(this.#process)) {
            return () => { };
        }
        /* c8 ignore stop */
        if (this.#loaded === false) {
            this.load();
        }
        const ev = opts?.alwaysLast ? 'afterExit' : 'exit';
        this.#emitter.on(ev, cb);
        return () => {
            this.#emitter.removeListener(ev, cb);
            if (this.#emitter.listeners['exit'].length === 0 &&
                this.#emitter.listeners['afterExit'].length === 0) {
                this.unload();
            }
        };
    }
    load() {
        if (this.#loaded) {
            return;
        }
        this.#loaded = true;
        // This is the number of onSignalExit's that are in play.
        // It's important so that we can count the correct number of
        // listeners on signals, and don't wait for the other one to
        // handle it instead of us.
        this.#emitter.count += 1;
        for (const sig of signals) {
            try {
                const fn = this.#sigListeners[sig];
                if (fn)
                    this.#process.on(sig, fn);
            }
            catch (_) { }
        }
        this.#process.emit = (ev, ...a) => {
            return this.#processEmit(ev, ...a);
        };
        this.#process.reallyExit = (code) => {
            return this.#processReallyExit(code);
        };
    }
    unload() {
        if (!this.#loaded) {
            return;
        }
        this.#loaded = false;
        signals.forEach(sig => {
            const listener = this.#sigListeners[sig];
            /* c8 ignore start */
            if (!listener) {
                throw new Error('Listener not defined for signal: ' + sig);
            }
            /* c8 ignore stop */
            try {
                this.#process.removeListener(sig, listener);
                /* c8 ignore start */
            }
            catch (_) { }
            /* c8 ignore stop */
        });
        this.#process.emit = this.#originalProcessEmit;
        this.#process.reallyExit = this.#originalProcessReallyExit;
        this.#emitter.count -= 1;
    }
    #processReallyExit(code) {
        /* c8 ignore start */
        if (!processOk(this.#process)) {
            return 0;
        }
        this.#process.exitCode = code || 0;
        /* c8 ignore stop */
        this.#emitter.emit('exit', this.#process.exitCode, null);
        return this.#originalProcessReallyExit.call(this.#process, this.#process.exitCode);
    }
    #processEmit(ev, ...args) {
        const og = this.#originalProcessEmit;
        if (ev === 'exit' && processOk(this.#process)) {
            if (typeof args[0] === 'number') {
                this.#process.exitCode = args[0];
                /* c8 ignore start */
            }
            /* c8 ignore start */
            const ret = og.call(this.#process, ev, ...args);
            /* c8 ignore start */
            this.#emitter.emit('exit', this.#process.exitCode, null);
            /* c8 ignore stop */
            return ret;
        }
        else {
            return og.call(this.#process, ev, ...args);
        }
    }
}
const process$1 = globalThis.process;
// wrap so that we call the method on the actual handler, without
// exporting it directly.
const { 
/**
 * Called when the process is exiting, whether via signal, explicit
 * exit, or running out of stuff to do.
 *
 * If the global process object is not suitable for instrumentation,
 * then this will be a no-op.
 *
 * Returns a function that may be used to unload signal-exit.
 */
onExit, 
/**
 * Load the listeners.  Likely you never need to call this, unless
 * doing a rather deep integration with signal-exit functionality.
 * Mostly exposed for the benefit of testing.
 *
 * @internal
 */
load, 
/**
 * Unload the listeners.  Likely you never need to call this, unless
 * doing a rather deep integration with signal-exit functionality.
 * Mostly exposed for the benefit of testing.
 *
 * @internal
 */
unload, } = signalExitWrap(processOk(process$1) ? new SignalExit(process$1) : new SignalExitFallback());

const terminal = process$2.stderr.isTTY
	? process$2.stderr
	: (process$2.stdout.isTTY ? process$2.stdout : undefined);

terminal ? onetime$1(() => {
	onExit(() => {
		terminal.write('\u001B[?25h');
	}, {alwaysLast: true});
}) : () => {};

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

var dots = {
	interval: 80,
	frames: [
		"⠋",
		"⠙",
		"⠹",
		"⠸",
		"⠼",
		"⠴",
		"⠦",
		"⠧",
		"⠇",
		"⠏"
	]
};
var dots2 = {
	interval: 80,
	frames: [
		"⣾",
		"⣽",
		"⣻",
		"⢿",
		"⡿",
		"⣟",
		"⣯",
		"⣷"
	]
};
var dots3 = {
	interval: 80,
	frames: [
		"⠋",
		"⠙",
		"⠚",
		"⠞",
		"⠖",
		"⠦",
		"⠴",
		"⠲",
		"⠳",
		"⠓"
	]
};
var dots4 = {
	interval: 80,
	frames: [
		"⠄",
		"⠆",
		"⠇",
		"⠋",
		"⠙",
		"⠸",
		"⠰",
		"⠠",
		"⠰",
		"⠸",
		"⠙",
		"⠋",
		"⠇",
		"⠆"
	]
};
var dots5 = {
	interval: 80,
	frames: [
		"⠋",
		"⠙",
		"⠚",
		"⠒",
		"⠂",
		"⠂",
		"⠒",
		"⠲",
		"⠴",
		"⠦",
		"⠖",
		"⠒",
		"⠐",
		"⠐",
		"⠒",
		"⠓",
		"⠋"
	]
};
var dots6 = {
	interval: 80,
	frames: [
		"⠁",
		"⠉",
		"⠙",
		"⠚",
		"⠒",
		"⠂",
		"⠂",
		"⠒",
		"⠲",
		"⠴",
		"⠤",
		"⠄",
		"⠄",
		"⠤",
		"⠴",
		"⠲",
		"⠒",
		"⠂",
		"⠂",
		"⠒",
		"⠚",
		"⠙",
		"⠉",
		"⠁"
	]
};
var dots7 = {
	interval: 80,
	frames: [
		"⠈",
		"⠉",
		"⠋",
		"⠓",
		"⠒",
		"⠐",
		"⠐",
		"⠒",
		"⠖",
		"⠦",
		"⠤",
		"⠠",
		"⠠",
		"⠤",
		"⠦",
		"⠖",
		"⠒",
		"⠐",
		"⠐",
		"⠒",
		"⠓",
		"⠋",
		"⠉",
		"⠈"
	]
};
var dots8 = {
	interval: 80,
	frames: [
		"⠁",
		"⠁",
		"⠉",
		"⠙",
		"⠚",
		"⠒",
		"⠂",
		"⠂",
		"⠒",
		"⠲",
		"⠴",
		"⠤",
		"⠄",
		"⠄",
		"⠤",
		"⠠",
		"⠠",
		"⠤",
		"⠦",
		"⠖",
		"⠒",
		"⠐",
		"⠐",
		"⠒",
		"⠓",
		"⠋",
		"⠉",
		"⠈",
		"⠈"
	]
};
var dots9 = {
	interval: 80,
	frames: [
		"⢹",
		"⢺",
		"⢼",
		"⣸",
		"⣇",
		"⡧",
		"⡗",
		"⡏"
	]
};
var dots10 = {
	interval: 80,
	frames: [
		"⢄",
		"⢂",
		"⢁",
		"⡁",
		"⡈",
		"⡐",
		"⡠"
	]
};
var dots11 = {
	interval: 100,
	frames: [
		"⠁",
		"⠂",
		"⠄",
		"⡀",
		"⢀",
		"⠠",
		"⠐",
		"⠈"
	]
};
var dots12 = {
	interval: 80,
	frames: [
		"⢀⠀",
		"⡀⠀",
		"⠄⠀",
		"⢂⠀",
		"⡂⠀",
		"⠅⠀",
		"⢃⠀",
		"⡃⠀",
		"⠍⠀",
		"⢋⠀",
		"⡋⠀",
		"⠍⠁",
		"⢋⠁",
		"⡋⠁",
		"⠍⠉",
		"⠋⠉",
		"⠋⠉",
		"⠉⠙",
		"⠉⠙",
		"⠉⠩",
		"⠈⢙",
		"⠈⡙",
		"⢈⠩",
		"⡀⢙",
		"⠄⡙",
		"⢂⠩",
		"⡂⢘",
		"⠅⡘",
		"⢃⠨",
		"⡃⢐",
		"⠍⡐",
		"⢋⠠",
		"⡋⢀",
		"⠍⡁",
		"⢋⠁",
		"⡋⠁",
		"⠍⠉",
		"⠋⠉",
		"⠋⠉",
		"⠉⠙",
		"⠉⠙",
		"⠉⠩",
		"⠈⢙",
		"⠈⡙",
		"⠈⠩",
		"⠀⢙",
		"⠀⡙",
		"⠀⠩",
		"⠀⢘",
		"⠀⡘",
		"⠀⠨",
		"⠀⢐",
		"⠀⡐",
		"⠀⠠",
		"⠀⢀",
		"⠀⡀"
	]
};
var dots13 = {
	interval: 80,
	frames: [
		"⣼",
		"⣹",
		"⢻",
		"⠿",
		"⡟",
		"⣏",
		"⣧",
		"⣶"
	]
};
var dots8Bit = {
	interval: 80,
	frames: [
		"⠀",
		"⠁",
		"⠂",
		"⠃",
		"⠄",
		"⠅",
		"⠆",
		"⠇",
		"⡀",
		"⡁",
		"⡂",
		"⡃",
		"⡄",
		"⡅",
		"⡆",
		"⡇",
		"⠈",
		"⠉",
		"⠊",
		"⠋",
		"⠌",
		"⠍",
		"⠎",
		"⠏",
		"⡈",
		"⡉",
		"⡊",
		"⡋",
		"⡌",
		"⡍",
		"⡎",
		"⡏",
		"⠐",
		"⠑",
		"⠒",
		"⠓",
		"⠔",
		"⠕",
		"⠖",
		"⠗",
		"⡐",
		"⡑",
		"⡒",
		"⡓",
		"⡔",
		"⡕",
		"⡖",
		"⡗",
		"⠘",
		"⠙",
		"⠚",
		"⠛",
		"⠜",
		"⠝",
		"⠞",
		"⠟",
		"⡘",
		"⡙",
		"⡚",
		"⡛",
		"⡜",
		"⡝",
		"⡞",
		"⡟",
		"⠠",
		"⠡",
		"⠢",
		"⠣",
		"⠤",
		"⠥",
		"⠦",
		"⠧",
		"⡠",
		"⡡",
		"⡢",
		"⡣",
		"⡤",
		"⡥",
		"⡦",
		"⡧",
		"⠨",
		"⠩",
		"⠪",
		"⠫",
		"⠬",
		"⠭",
		"⠮",
		"⠯",
		"⡨",
		"⡩",
		"⡪",
		"⡫",
		"⡬",
		"⡭",
		"⡮",
		"⡯",
		"⠰",
		"⠱",
		"⠲",
		"⠳",
		"⠴",
		"⠵",
		"⠶",
		"⠷",
		"⡰",
		"⡱",
		"⡲",
		"⡳",
		"⡴",
		"⡵",
		"⡶",
		"⡷",
		"⠸",
		"⠹",
		"⠺",
		"⠻",
		"⠼",
		"⠽",
		"⠾",
		"⠿",
		"⡸",
		"⡹",
		"⡺",
		"⡻",
		"⡼",
		"⡽",
		"⡾",
		"⡿",
		"⢀",
		"⢁",
		"⢂",
		"⢃",
		"⢄",
		"⢅",
		"⢆",
		"⢇",
		"⣀",
		"⣁",
		"⣂",
		"⣃",
		"⣄",
		"⣅",
		"⣆",
		"⣇",
		"⢈",
		"⢉",
		"⢊",
		"⢋",
		"⢌",
		"⢍",
		"⢎",
		"⢏",
		"⣈",
		"⣉",
		"⣊",
		"⣋",
		"⣌",
		"⣍",
		"⣎",
		"⣏",
		"⢐",
		"⢑",
		"⢒",
		"⢓",
		"⢔",
		"⢕",
		"⢖",
		"⢗",
		"⣐",
		"⣑",
		"⣒",
		"⣓",
		"⣔",
		"⣕",
		"⣖",
		"⣗",
		"⢘",
		"⢙",
		"⢚",
		"⢛",
		"⢜",
		"⢝",
		"⢞",
		"⢟",
		"⣘",
		"⣙",
		"⣚",
		"⣛",
		"⣜",
		"⣝",
		"⣞",
		"⣟",
		"⢠",
		"⢡",
		"⢢",
		"⢣",
		"⢤",
		"⢥",
		"⢦",
		"⢧",
		"⣠",
		"⣡",
		"⣢",
		"⣣",
		"⣤",
		"⣥",
		"⣦",
		"⣧",
		"⢨",
		"⢩",
		"⢪",
		"⢫",
		"⢬",
		"⢭",
		"⢮",
		"⢯",
		"⣨",
		"⣩",
		"⣪",
		"⣫",
		"⣬",
		"⣭",
		"⣮",
		"⣯",
		"⢰",
		"⢱",
		"⢲",
		"⢳",
		"⢴",
		"⢵",
		"⢶",
		"⢷",
		"⣰",
		"⣱",
		"⣲",
		"⣳",
		"⣴",
		"⣵",
		"⣶",
		"⣷",
		"⢸",
		"⢹",
		"⢺",
		"⢻",
		"⢼",
		"⢽",
		"⢾",
		"⢿",
		"⣸",
		"⣹",
		"⣺",
		"⣻",
		"⣼",
		"⣽",
		"⣾",
		"⣿"
	]
};
var sand = {
	interval: 80,
	frames: [
		"⠁",
		"⠂",
		"⠄",
		"⡀",
		"⡈",
		"⡐",
		"⡠",
		"⣀",
		"⣁",
		"⣂",
		"⣄",
		"⣌",
		"⣔",
		"⣤",
		"⣥",
		"⣦",
		"⣮",
		"⣶",
		"⣷",
		"⣿",
		"⡿",
		"⠿",
		"⢟",
		"⠟",
		"⡛",
		"⠛",
		"⠫",
		"⢋",
		"⠋",
		"⠍",
		"⡉",
		"⠉",
		"⠑",
		"⠡",
		"⢁"
	]
};
var line = {
	interval: 130,
	frames: [
		"-",
		"\\",
		"|",
		"/"
	]
};
var line2 = {
	interval: 100,
	frames: [
		"⠂",
		"-",
		"–",
		"—",
		"–",
		"-"
	]
};
var pipe = {
	interval: 100,
	frames: [
		"┤",
		"┘",
		"┴",
		"└",
		"├",
		"┌",
		"┬",
		"┐"
	]
};
var simpleDots = {
	interval: 400,
	frames: [
		".  ",
		".. ",
		"...",
		"   "
	]
};
var simpleDotsScrolling = {
	interval: 200,
	frames: [
		".  ",
		".. ",
		"...",
		" ..",
		"  .",
		"   "
	]
};
var star = {
	interval: 70,
	frames: [
		"✶",
		"✸",
		"✹",
		"✺",
		"✹",
		"✷"
	]
};
var star2 = {
	interval: 80,
	frames: [
		"+",
		"x",
		"*"
	]
};
var flip = {
	interval: 70,
	frames: [
		"_",
		"_",
		"_",
		"-",
		"`",
		"`",
		"'",
		"´",
		"-",
		"_",
		"_",
		"_"
	]
};
var hamburger = {
	interval: 100,
	frames: [
		"☱",
		"☲",
		"☴"
	]
};
var growVertical = {
	interval: 120,
	frames: [
		"▁",
		"▃",
		"▄",
		"▅",
		"▆",
		"▇",
		"▆",
		"▅",
		"▄",
		"▃"
	]
};
var growHorizontal = {
	interval: 120,
	frames: [
		"▏",
		"▎",
		"▍",
		"▌",
		"▋",
		"▊",
		"▉",
		"▊",
		"▋",
		"▌",
		"▍",
		"▎"
	]
};
var balloon = {
	interval: 140,
	frames: [
		" ",
		".",
		"o",
		"O",
		"@",
		"*",
		" "
	]
};
var balloon2 = {
	interval: 120,
	frames: [
		".",
		"o",
		"O",
		"°",
		"O",
		"o",
		"."
	]
};
var noise = {
	interval: 100,
	frames: [
		"▓",
		"▒",
		"░"
	]
};
var bounce = {
	interval: 120,
	frames: [
		"⠁",
		"⠂",
		"⠄",
		"⠂"
	]
};
var boxBounce = {
	interval: 120,
	frames: [
		"▖",
		"▘",
		"▝",
		"▗"
	]
};
var boxBounce2 = {
	interval: 100,
	frames: [
		"▌",
		"▀",
		"▐",
		"▄"
	]
};
var triangle = {
	interval: 50,
	frames: [
		"◢",
		"◣",
		"◤",
		"◥"
	]
};
var binary = {
	interval: 80,
	frames: [
		"010010",
		"001100",
		"100101",
		"111010",
		"111101",
		"010111",
		"101011",
		"111000",
		"110011",
		"110101"
	]
};
var arc = {
	interval: 100,
	frames: [
		"◜",
		"◠",
		"◝",
		"◞",
		"◡",
		"◟"
	]
};
var circle = {
	interval: 120,
	frames: [
		"◡",
		"⊙",
		"◠"
	]
};
var squareCorners = {
	interval: 180,
	frames: [
		"◰",
		"◳",
		"◲",
		"◱"
	]
};
var circleQuarters = {
	interval: 120,
	frames: [
		"◴",
		"◷",
		"◶",
		"◵"
	]
};
var circleHalves = {
	interval: 50,
	frames: [
		"◐",
		"◓",
		"◑",
		"◒"
	]
};
var squish = {
	interval: 100,
	frames: [
		"╫",
		"╪"
	]
};
var toggle = {
	interval: 250,
	frames: [
		"⊶",
		"⊷"
	]
};
var toggle2 = {
	interval: 80,
	frames: [
		"▫",
		"▪"
	]
};
var toggle3 = {
	interval: 120,
	frames: [
		"□",
		"■"
	]
};
var toggle4 = {
	interval: 100,
	frames: [
		"■",
		"□",
		"▪",
		"▫"
	]
};
var toggle5 = {
	interval: 100,
	frames: [
		"▮",
		"▯"
	]
};
var toggle6 = {
	interval: 300,
	frames: [
		"ဝ",
		"၀"
	]
};
var toggle7 = {
	interval: 80,
	frames: [
		"⦾",
		"⦿"
	]
};
var toggle8 = {
	interval: 100,
	frames: [
		"◍",
		"◌"
	]
};
var toggle9 = {
	interval: 100,
	frames: [
		"◉",
		"◎"
	]
};
var toggle10 = {
	interval: 100,
	frames: [
		"㊂",
		"㊀",
		"㊁"
	]
};
var toggle11 = {
	interval: 50,
	frames: [
		"⧇",
		"⧆"
	]
};
var toggle12 = {
	interval: 120,
	frames: [
		"☗",
		"☖"
	]
};
var toggle13 = {
	interval: 80,
	frames: [
		"=",
		"*",
		"-"
	]
};
var arrow = {
	interval: 100,
	frames: [
		"←",
		"↖",
		"↑",
		"↗",
		"→",
		"↘",
		"↓",
		"↙"
	]
};
var arrow2 = {
	interval: 80,
	frames: [
		"⬆️ ",
		"↗️ ",
		"➡️ ",
		"↘️ ",
		"⬇️ ",
		"↙️ ",
		"⬅️ ",
		"↖️ "
	]
};
var arrow3 = {
	interval: 120,
	frames: [
		"▹▹▹▹▹",
		"▸▹▹▹▹",
		"▹▸▹▹▹",
		"▹▹▸▹▹",
		"▹▹▹▸▹",
		"▹▹▹▹▸"
	]
};
var bouncingBar = {
	interval: 80,
	frames: [
		"[    ]",
		"[=   ]",
		"[==  ]",
		"[=== ]",
		"[====]",
		"[ ===]",
		"[  ==]",
		"[   =]",
		"[    ]",
		"[   =]",
		"[  ==]",
		"[ ===]",
		"[====]",
		"[=== ]",
		"[==  ]",
		"[=   ]"
	]
};
var bouncingBall = {
	interval: 80,
	frames: [
		"( ●    )",
		"(  ●   )",
		"(   ●  )",
		"(    ● )",
		"(     ●)",
		"(    ● )",
		"(   ●  )",
		"(  ●   )",
		"( ●    )",
		"(●     )"
	]
};
var smiley = {
	interval: 200,
	frames: [
		"😄 ",
		"😝 "
	]
};
var monkey = {
	interval: 300,
	frames: [
		"🙈 ",
		"🙈 ",
		"🙉 ",
		"🙊 "
	]
};
var hearts = {
	interval: 100,
	frames: [
		"💛 ",
		"💙 ",
		"💜 ",
		"💚 ",
		"❤️ "
	]
};
var clock = {
	interval: 100,
	frames: [
		"🕛 ",
		"🕐 ",
		"🕑 ",
		"🕒 ",
		"🕓 ",
		"🕔 ",
		"🕕 ",
		"🕖 ",
		"🕗 ",
		"🕘 ",
		"🕙 ",
		"🕚 "
	]
};
var earth = {
	interval: 180,
	frames: [
		"🌍 ",
		"🌎 ",
		"🌏 "
	]
};
var material = {
	interval: 17,
	frames: [
		"█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"███▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"███████▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"████████▁▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"██████████▁▁▁▁▁▁▁▁▁▁",
		"███████████▁▁▁▁▁▁▁▁▁",
		"█████████████▁▁▁▁▁▁▁",
		"██████████████▁▁▁▁▁▁",
		"██████████████▁▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁▁██████████████▁▁▁▁",
		"▁▁▁██████████████▁▁▁",
		"▁▁▁▁█████████████▁▁▁",
		"▁▁▁▁██████████████▁▁",
		"▁▁▁▁██████████████▁▁",
		"▁▁▁▁▁██████████████▁",
		"▁▁▁▁▁██████████████▁",
		"▁▁▁▁▁██████████████▁",
		"▁▁▁▁▁▁██████████████",
		"▁▁▁▁▁▁██████████████",
		"▁▁▁▁▁▁▁█████████████",
		"▁▁▁▁▁▁▁█████████████",
		"▁▁▁▁▁▁▁▁████████████",
		"▁▁▁▁▁▁▁▁████████████",
		"▁▁▁▁▁▁▁▁▁███████████",
		"▁▁▁▁▁▁▁▁▁███████████",
		"▁▁▁▁▁▁▁▁▁▁██████████",
		"▁▁▁▁▁▁▁▁▁▁██████████",
		"▁▁▁▁▁▁▁▁▁▁▁▁████████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁███████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁██████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████",
		"█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████",
		"██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"███▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"████▁▁▁▁▁▁▁▁▁▁▁▁▁▁██",
		"█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"██████▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"████████▁▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"█████████▁▁▁▁▁▁▁▁▁▁▁",
		"███████████▁▁▁▁▁▁▁▁▁",
		"████████████▁▁▁▁▁▁▁▁",
		"████████████▁▁▁▁▁▁▁▁",
		"██████████████▁▁▁▁▁▁",
		"██████████████▁▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁██████████████▁▁▁▁▁",
		"▁▁▁█████████████▁▁▁▁",
		"▁▁▁▁▁████████████▁▁▁",
		"▁▁▁▁▁████████████▁▁▁",
		"▁▁▁▁▁▁███████████▁▁▁",
		"▁▁▁▁▁▁▁▁█████████▁▁▁",
		"▁▁▁▁▁▁▁▁█████████▁▁▁",
		"▁▁▁▁▁▁▁▁▁█████████▁▁",
		"▁▁▁▁▁▁▁▁▁█████████▁▁",
		"▁▁▁▁▁▁▁▁▁▁█████████▁",
		"▁▁▁▁▁▁▁▁▁▁▁████████▁",
		"▁▁▁▁▁▁▁▁▁▁▁████████▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁███████▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁███████▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁███████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁███████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁",
		"▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁"
	]
};
var moon = {
	interval: 80,
	frames: [
		"🌑 ",
		"🌒 ",
		"🌓 ",
		"🌔 ",
		"🌕 ",
		"🌖 ",
		"🌗 ",
		"🌘 "
	]
};
var runner = {
	interval: 140,
	frames: [
		"🚶 ",
		"🏃 "
	]
};
var pong = {
	interval: 80,
	frames: [
		"▐⠂       ▌",
		"▐⠈       ▌",
		"▐ ⠂      ▌",
		"▐ ⠠      ▌",
		"▐  ⡀     ▌",
		"▐  ⠠     ▌",
		"▐   ⠂    ▌",
		"▐   ⠈    ▌",
		"▐    ⠂   ▌",
		"▐    ⠠   ▌",
		"▐     ⡀  ▌",
		"▐     ⠠  ▌",
		"▐      ⠂ ▌",
		"▐      ⠈ ▌",
		"▐       ⠂▌",
		"▐       ⠠▌",
		"▐       ⡀▌",
		"▐      ⠠ ▌",
		"▐      ⠂ ▌",
		"▐     ⠈  ▌",
		"▐     ⠂  ▌",
		"▐    ⠠   ▌",
		"▐    ⡀   ▌",
		"▐   ⠠    ▌",
		"▐   ⠂    ▌",
		"▐  ⠈     ▌",
		"▐  ⠂     ▌",
		"▐ ⠠      ▌",
		"▐ ⡀      ▌",
		"▐⠠       ▌"
	]
};
var shark = {
	interval: 120,
	frames: [
		"▐|\\____________▌",
		"▐_|\\___________▌",
		"▐__|\\__________▌",
		"▐___|\\_________▌",
		"▐____|\\________▌",
		"▐_____|\\_______▌",
		"▐______|\\______▌",
		"▐_______|\\_____▌",
		"▐________|\\____▌",
		"▐_________|\\___▌",
		"▐__________|\\__▌",
		"▐___________|\\_▌",
		"▐____________|\\▌",
		"▐____________/|▌",
		"▐___________/|_▌",
		"▐__________/|__▌",
		"▐_________/|___▌",
		"▐________/|____▌",
		"▐_______/|_____▌",
		"▐______/|______▌",
		"▐_____/|_______▌",
		"▐____/|________▌",
		"▐___/|_________▌",
		"▐__/|__________▌",
		"▐_/|___________▌",
		"▐/|____________▌"
	]
};
var dqpb = {
	interval: 100,
	frames: [
		"d",
		"q",
		"p",
		"b"
	]
};
var weather = {
	interval: 100,
	frames: [
		"☀️ ",
		"☀️ ",
		"☀️ ",
		"🌤 ",
		"⛅️ ",
		"🌥 ",
		"☁️ ",
		"🌧 ",
		"🌨 ",
		"🌧 ",
		"🌨 ",
		"🌧 ",
		"🌨 ",
		"⛈ ",
		"🌨 ",
		"🌧 ",
		"🌨 ",
		"☁️ ",
		"🌥 ",
		"⛅️ ",
		"🌤 ",
		"☀️ ",
		"☀️ "
	]
};
var christmas = {
	interval: 400,
	frames: [
		"🌲",
		"🎄"
	]
};
var grenade = {
	interval: 80,
	frames: [
		"،  ",
		"′  ",
		" ´ ",
		" ‾ ",
		"  ⸌",
		"  ⸊",
		"  |",
		"  ⁎",
		"  ⁕",
		" ෴ ",
		"  ⁓",
		"   ",
		"   ",
		"   "
	]
};
var point = {
	interval: 125,
	frames: [
		"∙∙∙",
		"●∙∙",
		"∙●∙",
		"∙∙●",
		"∙∙∙"
	]
};
var layer = {
	interval: 150,
	frames: [
		"-",
		"=",
		"≡"
	]
};
var betaWave = {
	interval: 80,
	frames: [
		"ρββββββ",
		"βρβββββ",
		"ββρββββ",
		"βββρβββ",
		"ββββρββ",
		"βββββρβ",
		"ββββββρ"
	]
};
var fingerDance = {
	interval: 160,
	frames: [
		"🤘 ",
		"🤟 ",
		"🖖 ",
		"✋ ",
		"🤚 ",
		"👆 "
	]
};
var fistBump = {
	interval: 80,
	frames: [
		"🤜　　　　🤛 ",
		"🤜　　　　🤛 ",
		"🤜　　　　🤛 ",
		"　🤜　　🤛　 ",
		"　　🤜🤛　　 ",
		"　🤜✨🤛　　 ",
		"🤜　✨　🤛　 "
	]
};
var soccerHeader = {
	interval: 80,
	frames: [
		" 🧑⚽️       🧑 ",
		"🧑  ⚽️      🧑 ",
		"🧑   ⚽️     🧑 ",
		"🧑    ⚽️    🧑 ",
		"🧑     ⚽️   🧑 ",
		"🧑      ⚽️  🧑 ",
		"🧑       ⚽️🧑  ",
		"🧑      ⚽️  🧑 ",
		"🧑     ⚽️   🧑 ",
		"🧑    ⚽️    🧑 ",
		"🧑   ⚽️     🧑 ",
		"🧑  ⚽️      🧑 "
	]
};
var mindblown = {
	interval: 160,
	frames: [
		"😐 ",
		"😐 ",
		"😮 ",
		"😮 ",
		"😦 ",
		"😦 ",
		"😧 ",
		"😧 ",
		"🤯 ",
		"💥 ",
		"✨ ",
		"　 ",
		"　 ",
		"　 "
	]
};
var speaker = {
	interval: 160,
	frames: [
		"🔈 ",
		"🔉 ",
		"🔊 ",
		"🔉 "
	]
};
var orangePulse = {
	interval: 100,
	frames: [
		"🔸 ",
		"🔶 ",
		"🟠 ",
		"🟠 ",
		"🔶 "
	]
};
var bluePulse = {
	interval: 100,
	frames: [
		"🔹 ",
		"🔷 ",
		"🔵 ",
		"🔵 ",
		"🔷 "
	]
};
var orangeBluePulse = {
	interval: 100,
	frames: [
		"🔸 ",
		"🔶 ",
		"🟠 ",
		"🟠 ",
		"🔶 ",
		"🔹 ",
		"🔷 ",
		"🔵 ",
		"🔵 ",
		"🔷 "
	]
};
var timeTravel = {
	interval: 100,
	frames: [
		"🕛 ",
		"🕚 ",
		"🕙 ",
		"🕘 ",
		"🕗 ",
		"🕖 ",
		"🕕 ",
		"🕔 ",
		"🕓 ",
		"🕒 ",
		"🕑 ",
		"🕐 "
	]
};
var aesthetic = {
	interval: 80,
	frames: [
		"▰▱▱▱▱▱▱",
		"▰▰▱▱▱▱▱",
		"▰▰▰▱▱▱▱",
		"▰▰▰▰▱▱▱",
		"▰▰▰▰▰▱▱",
		"▰▰▰▰▰▰▱",
		"▰▰▰▰▰▰▰",
		"▰▱▱▱▱▱▱"
	]
};
var dwarfFortress = {
	interval: 80,
	frames: [
		" ██████£££  ",
		"☺██████£££  ",
		"☺██████£££  ",
		"☺▓█████£££  ",
		"☺▓█████£££  ",
		"☺▒█████£££  ",
		"☺▒█████£££  ",
		"☺░█████£££  ",
		"☺░█████£££  ",
		"☺ █████£££  ",
		" ☺█████£££  ",
		" ☺█████£££  ",
		" ☺▓████£££  ",
		" ☺▓████£££  ",
		" ☺▒████£££  ",
		" ☺▒████£££  ",
		" ☺░████£££  ",
		" ☺░████£££  ",
		" ☺ ████£££  ",
		"  ☺████£££  ",
		"  ☺████£££  ",
		"  ☺▓███£££  ",
		"  ☺▓███£££  ",
		"  ☺▒███£££  ",
		"  ☺▒███£££  ",
		"  ☺░███£££  ",
		"  ☺░███£££  ",
		"  ☺ ███£££  ",
		"   ☺███£££  ",
		"   ☺███£££  ",
		"   ☺▓██£££  ",
		"   ☺▓██£££  ",
		"   ☺▒██£££  ",
		"   ☺▒██£££  ",
		"   ☺░██£££  ",
		"   ☺░██£££  ",
		"   ☺ ██£££  ",
		"    ☺██£££  ",
		"    ☺██£££  ",
		"    ☺▓█£££  ",
		"    ☺▓█£££  ",
		"    ☺▒█£££  ",
		"    ☺▒█£££  ",
		"    ☺░█£££  ",
		"    ☺░█£££  ",
		"    ☺ █£££  ",
		"     ☺█£££  ",
		"     ☺█£££  ",
		"     ☺▓£££  ",
		"     ☺▓£££  ",
		"     ☺▒£££  ",
		"     ☺▒£££  ",
		"     ☺░£££  ",
		"     ☺░£££  ",
		"     ☺ £££  ",
		"      ☺£££  ",
		"      ☺£££  ",
		"      ☺▓££  ",
		"      ☺▓££  ",
		"      ☺▒££  ",
		"      ☺▒££  ",
		"      ☺░££  ",
		"      ☺░££  ",
		"      ☺ ££  ",
		"       ☺££  ",
		"       ☺££  ",
		"       ☺▓£  ",
		"       ☺▓£  ",
		"       ☺▒£  ",
		"       ☺▒£  ",
		"       ☺░£  ",
		"       ☺░£  ",
		"       ☺ £  ",
		"        ☺£  ",
		"        ☺£  ",
		"        ☺▓  ",
		"        ☺▓  ",
		"        ☺▒  ",
		"        ☺▒  ",
		"        ☺░  ",
		"        ☺░  ",
		"        ☺   ",
		"        ☺  &",
		"        ☺ ☼&",
		"       ☺ ☼ &",
		"       ☺☼  &",
		"      ☺☼  & ",
		"      ‼   & ",
		"     ☺   &  ",
		"    ‼    &  ",
		"   ☺    &   ",
		"  ‼     &   ",
		" ☺     &    ",
		"‼      &    ",
		"      &     ",
		"      &     ",
		"     &   ░  ",
		"     &   ▒  ",
		"    &    ▓  ",
		"    &    £  ",
		"   &    ░£  ",
		"   &    ▒£  ",
		"  &     ▓£  ",
		"  &     ££  ",
		" &     ░££  ",
		" &     ▒££  ",
		"&      ▓££  ",
		"&      £££  ",
		"      ░£££  ",
		"      ▒£££  ",
		"      ▓£££  ",
		"      █£££  ",
		"     ░█£££  ",
		"     ▒█£££  ",
		"     ▓█£££  ",
		"     ██£££  ",
		"    ░██£££  ",
		"    ▒██£££  ",
		"    ▓██£££  ",
		"    ███£££  ",
		"   ░███£££  ",
		"   ▒███£££  ",
		"   ▓███£££  ",
		"   ████£££  ",
		"  ░████£££  ",
		"  ▒████£££  ",
		"  ▓████£££  ",
		"  █████£££  ",
		" ░█████£££  ",
		" ▒█████£££  ",
		" ▓█████£££  ",
		" ██████£££  ",
		" ██████£££  "
	]
};
var require$$0 = {
	dots: dots,
	dots2: dots2,
	dots3: dots3,
	dots4: dots4,
	dots5: dots5,
	dots6: dots6,
	dots7: dots7,
	dots8: dots8,
	dots9: dots9,
	dots10: dots10,
	dots11: dots11,
	dots12: dots12,
	dots13: dots13,
	dots8Bit: dots8Bit,
	sand: sand,
	line: line,
	line2: line2,
	pipe: pipe,
	simpleDots: simpleDots,
	simpleDotsScrolling: simpleDotsScrolling,
	star: star,
	star2: star2,
	flip: flip,
	hamburger: hamburger,
	growVertical: growVertical,
	growHorizontal: growHorizontal,
	balloon: balloon,
	balloon2: balloon2,
	noise: noise,
	bounce: bounce,
	boxBounce: boxBounce,
	boxBounce2: boxBounce2,
	triangle: triangle,
	binary: binary,
	arc: arc,
	circle: circle,
	squareCorners: squareCorners,
	circleQuarters: circleQuarters,
	circleHalves: circleHalves,
	squish: squish,
	toggle: toggle,
	toggle2: toggle2,
	toggle3: toggle3,
	toggle4: toggle4,
	toggle5: toggle5,
	toggle6: toggle6,
	toggle7: toggle7,
	toggle8: toggle8,
	toggle9: toggle9,
	toggle10: toggle10,
	toggle11: toggle11,
	toggle12: toggle12,
	toggle13: toggle13,
	arrow: arrow,
	arrow2: arrow2,
	arrow3: arrow3,
	bouncingBar: bouncingBar,
	bouncingBall: bouncingBall,
	smiley: smiley,
	monkey: monkey,
	hearts: hearts,
	clock: clock,
	earth: earth,
	material: material,
	moon: moon,
	runner: runner,
	pong: pong,
	shark: shark,
	dqpb: dqpb,
	weather: weather,
	christmas: christmas,
	grenade: grenade,
	point: point,
	layer: layer,
	betaWave: betaWave,
	fingerDance: fingerDance,
	fistBump: fistBump,
	soccerHeader: soccerHeader,
	mindblown: mindblown,
	speaker: speaker,
	orangePulse: orangePulse,
	bluePulse: bluePulse,
	orangeBluePulse: orangeBluePulse,
	timeTravel: timeTravel,
	aesthetic: aesthetic,
	dwarfFortress: dwarfFortress
};

var cliSpinners$1;
var hasRequiredCliSpinners;

function requireCliSpinners () {
	if (hasRequiredCliSpinners) return cliSpinners$1;
	hasRequiredCliSpinners = 1;

	const spinners = Object.assign({}, require$$0); // eslint-disable-line import/extensions

	const spinnersList = Object.keys(spinners);

	Object.defineProperty(spinners, 'random', {
		get() {
			const randomIndex = Math.floor(Math.random() * spinnersList.length);
			const spinnerName = spinnersList[randomIndex];
			return spinners[spinnerName];
		}
	});

	cliSpinners$1 = spinners;
	return cliSpinners$1;
}

requireCliSpinners();
/**
 * Logs the specified text to the console with the specified color.
 * @param {string} text - The text to be logged.
 * @param {Color} color - The color to use for logging the text.
 */
const logText = (text, color) => {
    console.log(chalk$1[color](`${text}`));
};

var streams = {};

var ponyfill_es2018$1 = {exports: {}};

/**
 * @license
 * web-streams-polyfill v3.3.3
 * Copyright 2024 Mattias Buelens, Diwank Singh Tomer and other contributors.
 * This code is released under the MIT license.
 * SPDX-License-Identifier: MIT
 */
var ponyfill_es2018 = ponyfill_es2018$1.exports;

var hasRequiredPonyfill_es2018;

function requirePonyfill_es2018 () {
	if (hasRequiredPonyfill_es2018) return ponyfill_es2018$1.exports;
	hasRequiredPonyfill_es2018 = 1;
	(function (module, exports) {
		(function (global, factory) {
		    factory(exports) ;
		})(ponyfill_es2018, (function (exports) {
		    function noop() {
		        return undefined;
		    }

		    function typeIsObject(x) {
		        return (typeof x === 'object' && x !== null) || typeof x === 'function';
		    }
		    const rethrowAssertionErrorRejection = noop;
		    function setFunctionName(fn, name) {
		        try {
		            Object.defineProperty(fn, 'name', {
		                value: name,
		                configurable: true
		            });
		        }
		        catch (_a) {
		            // This property is non-configurable in older browsers, so ignore if this throws.
		            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#browser_compatibility
		        }
		    }

		    const originalPromise = Promise;
		    const originalPromiseThen = Promise.prototype.then;
		    const originalPromiseReject = Promise.reject.bind(originalPromise);
		    // https://webidl.spec.whatwg.org/#a-new-promise
		    function newPromise(executor) {
		        return new originalPromise(executor);
		    }
		    // https://webidl.spec.whatwg.org/#a-promise-resolved-with
		    function promiseResolvedWith(value) {
		        return newPromise(resolve => resolve(value));
		    }
		    // https://webidl.spec.whatwg.org/#a-promise-rejected-with
		    function promiseRejectedWith(reason) {
		        return originalPromiseReject(reason);
		    }
		    function PerformPromiseThen(promise, onFulfilled, onRejected) {
		        // There doesn't appear to be any way to correctly emulate the behaviour from JavaScript, so this is just an
		        // approximation.
		        return originalPromiseThen.call(promise, onFulfilled, onRejected);
		    }
		    // Bluebird logs a warning when a promise is created within a fulfillment handler, but then isn't returned
		    // from that handler. To prevent this, return null instead of void from all handlers.
		    // http://bluebirdjs.com/docs/warning-explanations.html#warning-a-promise-was-created-in-a-handler-but-was-not-returned-from-it
		    function uponPromise(promise, onFulfilled, onRejected) {
		        PerformPromiseThen(PerformPromiseThen(promise, onFulfilled, onRejected), undefined, rethrowAssertionErrorRejection);
		    }
		    function uponFulfillment(promise, onFulfilled) {
		        uponPromise(promise, onFulfilled);
		    }
		    function uponRejection(promise, onRejected) {
		        uponPromise(promise, undefined, onRejected);
		    }
		    function transformPromiseWith(promise, fulfillmentHandler, rejectionHandler) {
		        return PerformPromiseThen(promise, fulfillmentHandler, rejectionHandler);
		    }
		    function setPromiseIsHandledToTrue(promise) {
		        PerformPromiseThen(promise, undefined, rethrowAssertionErrorRejection);
		    }
		    let _queueMicrotask = callback => {
		        if (typeof queueMicrotask === 'function') {
		            _queueMicrotask = queueMicrotask;
		        }
		        else {
		            const resolvedPromise = promiseResolvedWith(undefined);
		            _queueMicrotask = cb => PerformPromiseThen(resolvedPromise, cb);
		        }
		        return _queueMicrotask(callback);
		    };
		    function reflectCall(F, V, args) {
		        if (typeof F !== 'function') {
		            throw new TypeError('Argument is not a function');
		        }
		        return Function.prototype.apply.call(F, V, args);
		    }
		    function promiseCall(F, V, args) {
		        try {
		            return promiseResolvedWith(reflectCall(F, V, args));
		        }
		        catch (value) {
		            return promiseRejectedWith(value);
		        }
		    }

		    // Original from Chromium
		    // https://chromium.googlesource.com/chromium/src/+/0aee4434a4dba42a42abaea9bfbc0cd196a63bc1/third_party/blink/renderer/core/streams/SimpleQueue.js
		    const QUEUE_MAX_ARRAY_SIZE = 16384;
		    /**
		     * Simple queue structure.
		     *
		     * Avoids scalability issues with using a packed array directly by using
		     * multiple arrays in a linked list and keeping the array size bounded.
		     */
		    class SimpleQueue {
		        constructor() {
		            this._cursor = 0;
		            this._size = 0;
		            // _front and _back are always defined.
		            this._front = {
		                _elements: [],
		                _next: undefined
		            };
		            this._back = this._front;
		            // The cursor is used to avoid calling Array.shift().
		            // It contains the index of the front element of the array inside the
		            // front-most node. It is always in the range [0, QUEUE_MAX_ARRAY_SIZE).
		            this._cursor = 0;
		            // When there is only one node, size === elements.length - cursor.
		            this._size = 0;
		        }
		        get length() {
		            return this._size;
		        }
		        // For exception safety, this method is structured in order:
		        // 1. Read state
		        // 2. Calculate required state mutations
		        // 3. Perform state mutations
		        push(element) {
		            const oldBack = this._back;
		            let newBack = oldBack;
		            if (oldBack._elements.length === QUEUE_MAX_ARRAY_SIZE - 1) {
		                newBack = {
		                    _elements: [],
		                    _next: undefined
		                };
		            }
		            // push() is the mutation most likely to throw an exception, so it
		            // goes first.
		            oldBack._elements.push(element);
		            if (newBack !== oldBack) {
		                this._back = newBack;
		                oldBack._next = newBack;
		            }
		            ++this._size;
		        }
		        // Like push(), shift() follows the read -> calculate -> mutate pattern for
		        // exception safety.
		        shift() { // must not be called on an empty queue
		            const oldFront = this._front;
		            let newFront = oldFront;
		            const oldCursor = this._cursor;
		            let newCursor = oldCursor + 1;
		            const elements = oldFront._elements;
		            const element = elements[oldCursor];
		            if (newCursor === QUEUE_MAX_ARRAY_SIZE) {
		                newFront = oldFront._next;
		                newCursor = 0;
		            }
		            // No mutations before this point.
		            --this._size;
		            this._cursor = newCursor;
		            if (oldFront !== newFront) {
		                this._front = newFront;
		            }
		            // Permit shifted element to be garbage collected.
		            elements[oldCursor] = undefined;
		            return element;
		        }
		        // The tricky thing about forEach() is that it can be called
		        // re-entrantly. The queue may be mutated inside the callback. It is easy to
		        // see that push() within the callback has no negative effects since the end
		        // of the queue is checked for on every iteration. If shift() is called
		        // repeatedly within the callback then the next iteration may return an
		        // element that has been removed. In this case the callback will be called
		        // with undefined values until we either "catch up" with elements that still
		        // exist or reach the back of the queue.
		        forEach(callback) {
		            let i = this._cursor;
		            let node = this._front;
		            let elements = node._elements;
		            while (i !== elements.length || node._next !== undefined) {
		                if (i === elements.length) {
		                    node = node._next;
		                    elements = node._elements;
		                    i = 0;
		                    if (elements.length === 0) {
		                        break;
		                    }
		                }
		                callback(elements[i]);
		                ++i;
		            }
		        }
		        // Return the element that would be returned if shift() was called now,
		        // without modifying the queue.
		        peek() { // must not be called on an empty queue
		            const front = this._front;
		            const cursor = this._cursor;
		            return front._elements[cursor];
		        }
		    }

		    const AbortSteps = Symbol('[[AbortSteps]]');
		    const ErrorSteps = Symbol('[[ErrorSteps]]');
		    const CancelSteps = Symbol('[[CancelSteps]]');
		    const PullSteps = Symbol('[[PullSteps]]');
		    const ReleaseSteps = Symbol('[[ReleaseSteps]]');

		    function ReadableStreamReaderGenericInitialize(reader, stream) {
		        reader._ownerReadableStream = stream;
		        stream._reader = reader;
		        if (stream._state === 'readable') {
		            defaultReaderClosedPromiseInitialize(reader);
		        }
		        else if (stream._state === 'closed') {
		            defaultReaderClosedPromiseInitializeAsResolved(reader);
		        }
		        else {
		            defaultReaderClosedPromiseInitializeAsRejected(reader, stream._storedError);
		        }
		    }
		    // A client of ReadableStreamDefaultReader and ReadableStreamBYOBReader may use these functions directly to bypass state
		    // check.
		    function ReadableStreamReaderGenericCancel(reader, reason) {
		        const stream = reader._ownerReadableStream;
		        return ReadableStreamCancel(stream, reason);
		    }
		    function ReadableStreamReaderGenericRelease(reader) {
		        const stream = reader._ownerReadableStream;
		        if (stream._state === 'readable') {
		            defaultReaderClosedPromiseReject(reader, new TypeError(`Reader was released and can no longer be used to monitor the stream's closedness`));
		        }
		        else {
		            defaultReaderClosedPromiseResetToRejected(reader, new TypeError(`Reader was released and can no longer be used to monitor the stream's closedness`));
		        }
		        stream._readableStreamController[ReleaseSteps]();
		        stream._reader = undefined;
		        reader._ownerReadableStream = undefined;
		    }
		    // Helper functions for the readers.
		    function readerLockException(name) {
		        return new TypeError('Cannot ' + name + ' a stream using a released reader');
		    }
		    // Helper functions for the ReadableStreamDefaultReader.
		    function defaultReaderClosedPromiseInitialize(reader) {
		        reader._closedPromise = newPromise((resolve, reject) => {
		            reader._closedPromise_resolve = resolve;
		            reader._closedPromise_reject = reject;
		        });
		    }
		    function defaultReaderClosedPromiseInitializeAsRejected(reader, reason) {
		        defaultReaderClosedPromiseInitialize(reader);
		        defaultReaderClosedPromiseReject(reader, reason);
		    }
		    function defaultReaderClosedPromiseInitializeAsResolved(reader) {
		        defaultReaderClosedPromiseInitialize(reader);
		        defaultReaderClosedPromiseResolve(reader);
		    }
		    function defaultReaderClosedPromiseReject(reader, reason) {
		        if (reader._closedPromise_reject === undefined) {
		            return;
		        }
		        setPromiseIsHandledToTrue(reader._closedPromise);
		        reader._closedPromise_reject(reason);
		        reader._closedPromise_resolve = undefined;
		        reader._closedPromise_reject = undefined;
		    }
		    function defaultReaderClosedPromiseResetToRejected(reader, reason) {
		        defaultReaderClosedPromiseInitializeAsRejected(reader, reason);
		    }
		    function defaultReaderClosedPromiseResolve(reader) {
		        if (reader._closedPromise_resolve === undefined) {
		            return;
		        }
		        reader._closedPromise_resolve(undefined);
		        reader._closedPromise_resolve = undefined;
		        reader._closedPromise_reject = undefined;
		    }

		    /// <reference lib="es2015.core" />
		    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite#Polyfill
		    const NumberIsFinite = Number.isFinite || function (x) {
		        return typeof x === 'number' && isFinite(x);
		    };

		    /// <reference lib="es2015.core" />
		    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc#Polyfill
		    const MathTrunc = Math.trunc || function (v) {
		        return v < 0 ? Math.ceil(v) : Math.floor(v);
		    };

		    // https://heycam.github.io/webidl/#idl-dictionaries
		    function isDictionary(x) {
		        return typeof x === 'object' || typeof x === 'function';
		    }
		    function assertDictionary(obj, context) {
		        if (obj !== undefined && !isDictionary(obj)) {
		            throw new TypeError(`${context} is not an object.`);
		        }
		    }
		    // https://heycam.github.io/webidl/#idl-callback-functions
		    function assertFunction(x, context) {
		        if (typeof x !== 'function') {
		            throw new TypeError(`${context} is not a function.`);
		        }
		    }
		    // https://heycam.github.io/webidl/#idl-object
		    function isObject(x) {
		        return (typeof x === 'object' && x !== null) || typeof x === 'function';
		    }
		    function assertObject(x, context) {
		        if (!isObject(x)) {
		            throw new TypeError(`${context} is not an object.`);
		        }
		    }
		    function assertRequiredArgument(x, position, context) {
		        if (x === undefined) {
		            throw new TypeError(`Parameter ${position} is required in '${context}'.`);
		        }
		    }
		    function assertRequiredField(x, field, context) {
		        if (x === undefined) {
		            throw new TypeError(`${field} is required in '${context}'.`);
		        }
		    }
		    // https://heycam.github.io/webidl/#idl-unrestricted-double
		    function convertUnrestrictedDouble(value) {
		        return Number(value);
		    }
		    function censorNegativeZero(x) {
		        return x === 0 ? 0 : x;
		    }
		    function integerPart(x) {
		        return censorNegativeZero(MathTrunc(x));
		    }
		    // https://heycam.github.io/webidl/#idl-unsigned-long-long
		    function convertUnsignedLongLongWithEnforceRange(value, context) {
		        const lowerBound = 0;
		        const upperBound = Number.MAX_SAFE_INTEGER;
		        let x = Number(value);
		        x = censorNegativeZero(x);
		        if (!NumberIsFinite(x)) {
		            throw new TypeError(`${context} is not a finite number`);
		        }
		        x = integerPart(x);
		        if (x < lowerBound || x > upperBound) {
		            throw new TypeError(`${context} is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`);
		        }
		        if (!NumberIsFinite(x) || x === 0) {
		            return 0;
		        }
		        // TODO Use BigInt if supported?
		        // let xBigInt = BigInt(integerPart(x));
		        // xBigInt = BigInt.asUintN(64, xBigInt);
		        // return Number(xBigInt);
		        return x;
		    }

		    function assertReadableStream(x, context) {
		        if (!IsReadableStream(x)) {
		            throw new TypeError(`${context} is not a ReadableStream.`);
		        }
		    }

		    // Abstract operations for the ReadableStream.
		    function AcquireReadableStreamDefaultReader(stream) {
		        return new ReadableStreamDefaultReader(stream);
		    }
		    // ReadableStream API exposed for controllers.
		    function ReadableStreamAddReadRequest(stream, readRequest) {
		        stream._reader._readRequests.push(readRequest);
		    }
		    function ReadableStreamFulfillReadRequest(stream, chunk, done) {
		        const reader = stream._reader;
		        const readRequest = reader._readRequests.shift();
		        if (done) {
		            readRequest._closeSteps();
		        }
		        else {
		            readRequest._chunkSteps(chunk);
		        }
		    }
		    function ReadableStreamGetNumReadRequests(stream) {
		        return stream._reader._readRequests.length;
		    }
		    function ReadableStreamHasDefaultReader(stream) {
		        const reader = stream._reader;
		        if (reader === undefined) {
		            return false;
		        }
		        if (!IsReadableStreamDefaultReader(reader)) {
		            return false;
		        }
		        return true;
		    }
		    /**
		     * A default reader vended by a {@link ReadableStream}.
		     *
		     * @public
		     */
		    class ReadableStreamDefaultReader {
		        constructor(stream) {
		            assertRequiredArgument(stream, 1, 'ReadableStreamDefaultReader');
		            assertReadableStream(stream, 'First parameter');
		            if (IsReadableStreamLocked(stream)) {
		                throw new TypeError('This stream has already been locked for exclusive reading by another reader');
		            }
		            ReadableStreamReaderGenericInitialize(this, stream);
		            this._readRequests = new SimpleQueue();
		        }
		        /**
		         * Returns a promise that will be fulfilled when the stream becomes closed,
		         * or rejected if the stream ever errors or the reader's lock is released before the stream finishes closing.
		         */
		        get closed() {
		            if (!IsReadableStreamDefaultReader(this)) {
		                return promiseRejectedWith(defaultReaderBrandCheckException('closed'));
		            }
		            return this._closedPromise;
		        }
		        /**
		         * If the reader is active, behaves the same as {@link ReadableStream.cancel | stream.cancel(reason)}.
		         */
		        cancel(reason = undefined) {
		            if (!IsReadableStreamDefaultReader(this)) {
		                return promiseRejectedWith(defaultReaderBrandCheckException('cancel'));
		            }
		            if (this._ownerReadableStream === undefined) {
		                return promiseRejectedWith(readerLockException('cancel'));
		            }
		            return ReadableStreamReaderGenericCancel(this, reason);
		        }
		        /**
		         * Returns a promise that allows access to the next chunk from the stream's internal queue, if available.
		         *
		         * If reading a chunk causes the queue to become empty, more data will be pulled from the underlying source.
		         */
		        read() {
		            if (!IsReadableStreamDefaultReader(this)) {
		                return promiseRejectedWith(defaultReaderBrandCheckException('read'));
		            }
		            if (this._ownerReadableStream === undefined) {
		                return promiseRejectedWith(readerLockException('read from'));
		            }
		            let resolvePromise;
		            let rejectPromise;
		            const promise = newPromise((resolve, reject) => {
		                resolvePromise = resolve;
		                rejectPromise = reject;
		            });
		            const readRequest = {
		                _chunkSteps: chunk => resolvePromise({ value: chunk, done: false }),
		                _closeSteps: () => resolvePromise({ value: undefined, done: true }),
		                _errorSteps: e => rejectPromise(e)
		            };
		            ReadableStreamDefaultReaderRead(this, readRequest);
		            return promise;
		        }
		        /**
		         * Releases the reader's lock on the corresponding stream. After the lock is released, the reader is no longer active.
		         * If the associated stream is errored when the lock is released, the reader will appear errored in the same way
		         * from now on; otherwise, the reader will appear closed.
		         *
		         * A reader's lock cannot be released while it still has a pending read request, i.e., if a promise returned by
		         * the reader's {@link ReadableStreamDefaultReader.read | read()} method has not yet been settled. Attempting to
		         * do so will throw a `TypeError` and leave the reader locked to the stream.
		         */
		        releaseLock() {
		            if (!IsReadableStreamDefaultReader(this)) {
		                throw defaultReaderBrandCheckException('releaseLock');
		            }
		            if (this._ownerReadableStream === undefined) {
		                return;
		            }
		            ReadableStreamDefaultReaderRelease(this);
		        }
		    }
		    Object.defineProperties(ReadableStreamDefaultReader.prototype, {
		        cancel: { enumerable: true },
		        read: { enumerable: true },
		        releaseLock: { enumerable: true },
		        closed: { enumerable: true }
		    });
		    setFunctionName(ReadableStreamDefaultReader.prototype.cancel, 'cancel');
		    setFunctionName(ReadableStreamDefaultReader.prototype.read, 'read');
		    setFunctionName(ReadableStreamDefaultReader.prototype.releaseLock, 'releaseLock');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(ReadableStreamDefaultReader.prototype, Symbol.toStringTag, {
		            value: 'ReadableStreamDefaultReader',
		            configurable: true
		        });
		    }
		    // Abstract operations for the readers.
		    function IsReadableStreamDefaultReader(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_readRequests')) {
		            return false;
		        }
		        return x instanceof ReadableStreamDefaultReader;
		    }
		    function ReadableStreamDefaultReaderRead(reader, readRequest) {
		        const stream = reader._ownerReadableStream;
		        stream._disturbed = true;
		        if (stream._state === 'closed') {
		            readRequest._closeSteps();
		        }
		        else if (stream._state === 'errored') {
		            readRequest._errorSteps(stream._storedError);
		        }
		        else {
		            stream._readableStreamController[PullSteps](readRequest);
		        }
		    }
		    function ReadableStreamDefaultReaderRelease(reader) {
		        ReadableStreamReaderGenericRelease(reader);
		        const e = new TypeError('Reader was released');
		        ReadableStreamDefaultReaderErrorReadRequests(reader, e);
		    }
		    function ReadableStreamDefaultReaderErrorReadRequests(reader, e) {
		        const readRequests = reader._readRequests;
		        reader._readRequests = new SimpleQueue();
		        readRequests.forEach(readRequest => {
		            readRequest._errorSteps(e);
		        });
		    }
		    // Helper functions for the ReadableStreamDefaultReader.
		    function defaultReaderBrandCheckException(name) {
		        return new TypeError(`ReadableStreamDefaultReader.prototype.${name} can only be used on a ReadableStreamDefaultReader`);
		    }

		    /// <reference lib="es2018.asynciterable" />
		    /* eslint-disable @typescript-eslint/no-empty-function */
		    const AsyncIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf(async function* () { }).prototype);

		    /// <reference lib="es2018.asynciterable" />
		    class ReadableStreamAsyncIteratorImpl {
		        constructor(reader, preventCancel) {
		            this._ongoingPromise = undefined;
		            this._isFinished = false;
		            this._reader = reader;
		            this._preventCancel = preventCancel;
		        }
		        next() {
		            const nextSteps = () => this._nextSteps();
		            this._ongoingPromise = this._ongoingPromise ?
		                transformPromiseWith(this._ongoingPromise, nextSteps, nextSteps) :
		                nextSteps();
		            return this._ongoingPromise;
		        }
		        return(value) {
		            const returnSteps = () => this._returnSteps(value);
		            return this._ongoingPromise ?
		                transformPromiseWith(this._ongoingPromise, returnSteps, returnSteps) :
		                returnSteps();
		        }
		        _nextSteps() {
		            if (this._isFinished) {
		                return Promise.resolve({ value: undefined, done: true });
		            }
		            const reader = this._reader;
		            let resolvePromise;
		            let rejectPromise;
		            const promise = newPromise((resolve, reject) => {
		                resolvePromise = resolve;
		                rejectPromise = reject;
		            });
		            const readRequest = {
		                _chunkSteps: chunk => {
		                    this._ongoingPromise = undefined;
		                    // This needs to be delayed by one microtask, otherwise we stop pulling too early which breaks a test.
		                    // FIXME Is this a bug in the specification, or in the test?
		                    _queueMicrotask(() => resolvePromise({ value: chunk, done: false }));
		                },
		                _closeSteps: () => {
		                    this._ongoingPromise = undefined;
		                    this._isFinished = true;
		                    ReadableStreamReaderGenericRelease(reader);
		                    resolvePromise({ value: undefined, done: true });
		                },
		                _errorSteps: reason => {
		                    this._ongoingPromise = undefined;
		                    this._isFinished = true;
		                    ReadableStreamReaderGenericRelease(reader);
		                    rejectPromise(reason);
		                }
		            };
		            ReadableStreamDefaultReaderRead(reader, readRequest);
		            return promise;
		        }
		        _returnSteps(value) {
		            if (this._isFinished) {
		                return Promise.resolve({ value, done: true });
		            }
		            this._isFinished = true;
		            const reader = this._reader;
		            if (!this._preventCancel) {
		                const result = ReadableStreamReaderGenericCancel(reader, value);
		                ReadableStreamReaderGenericRelease(reader);
		                return transformPromiseWith(result, () => ({ value, done: true }));
		            }
		            ReadableStreamReaderGenericRelease(reader);
		            return promiseResolvedWith({ value, done: true });
		        }
		    }
		    const ReadableStreamAsyncIteratorPrototype = {
		        next() {
		            if (!IsReadableStreamAsyncIterator(this)) {
		                return promiseRejectedWith(streamAsyncIteratorBrandCheckException('next'));
		            }
		            return this._asyncIteratorImpl.next();
		        },
		        return(value) {
		            if (!IsReadableStreamAsyncIterator(this)) {
		                return promiseRejectedWith(streamAsyncIteratorBrandCheckException('return'));
		            }
		            return this._asyncIteratorImpl.return(value);
		        }
		    };
		    Object.setPrototypeOf(ReadableStreamAsyncIteratorPrototype, AsyncIteratorPrototype);
		    // Abstract operations for the ReadableStream.
		    function AcquireReadableStreamAsyncIterator(stream, preventCancel) {
		        const reader = AcquireReadableStreamDefaultReader(stream);
		        const impl = new ReadableStreamAsyncIteratorImpl(reader, preventCancel);
		        const iterator = Object.create(ReadableStreamAsyncIteratorPrototype);
		        iterator._asyncIteratorImpl = impl;
		        return iterator;
		    }
		    function IsReadableStreamAsyncIterator(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_asyncIteratorImpl')) {
		            return false;
		        }
		        try {
		            // noinspection SuspiciousTypeOfGuard
		            return x._asyncIteratorImpl instanceof
		                ReadableStreamAsyncIteratorImpl;
		        }
		        catch (_a) {
		            return false;
		        }
		    }
		    // Helper functions for the ReadableStream.
		    function streamAsyncIteratorBrandCheckException(name) {
		        return new TypeError(`ReadableStreamAsyncIterator.${name} can only be used on a ReadableSteamAsyncIterator`);
		    }

		    /// <reference lib="es2015.core" />
		    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isNaN#Polyfill
		    const NumberIsNaN = Number.isNaN || function (x) {
		        // eslint-disable-next-line no-self-compare
		        return x !== x;
		    };

		    var _a, _b, _c;
		    function CreateArrayFromList(elements) {
		        // We use arrays to represent lists, so this is basically a no-op.
		        // Do a slice though just in case we happen to depend on the unique-ness.
		        return elements.slice();
		    }
		    function CopyDataBlockBytes(dest, destOffset, src, srcOffset, n) {
		        new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
		    }
		    let TransferArrayBuffer = (O) => {
		        if (typeof O.transfer === 'function') {
		            TransferArrayBuffer = buffer => buffer.transfer();
		        }
		        else if (typeof structuredClone === 'function') {
		            TransferArrayBuffer = buffer => structuredClone(buffer, { transfer: [buffer] });
		        }
		        else {
		            // Not implemented correctly
		            TransferArrayBuffer = buffer => buffer;
		        }
		        return TransferArrayBuffer(O);
		    };
		    let IsDetachedBuffer = (O) => {
		        if (typeof O.detached === 'boolean') {
		            IsDetachedBuffer = buffer => buffer.detached;
		        }
		        else {
		            // Not implemented correctly
		            IsDetachedBuffer = buffer => buffer.byteLength === 0;
		        }
		        return IsDetachedBuffer(O);
		    };
		    function ArrayBufferSlice(buffer, begin, end) {
		        // ArrayBuffer.prototype.slice is not available on IE10
		        // https://www.caniuse.com/mdn-javascript_builtins_arraybuffer_slice
		        if (buffer.slice) {
		            return buffer.slice(begin, end);
		        }
		        const length = end - begin;
		        const slice = new ArrayBuffer(length);
		        CopyDataBlockBytes(slice, 0, buffer, begin, length);
		        return slice;
		    }
		    function GetMethod(receiver, prop) {
		        const func = receiver[prop];
		        if (func === undefined || func === null) {
		            return undefined;
		        }
		        if (typeof func !== 'function') {
		            throw new TypeError(`${String(prop)} is not a function`);
		        }
		        return func;
		    }
		    function CreateAsyncFromSyncIterator(syncIteratorRecord) {
		        // Instead of re-implementing CreateAsyncFromSyncIterator and %AsyncFromSyncIteratorPrototype%,
		        // we use yield* inside an async generator function to achieve the same result.
		        // Wrap the sync iterator inside a sync iterable, so we can use it with yield*.
		        const syncIterable = {
		            [Symbol.iterator]: () => syncIteratorRecord.iterator
		        };
		        // Create an async generator function and immediately invoke it.
		        const asyncIterator = (async function* () {
		            return yield* syncIterable;
		        }());
		        // Return as an async iterator record.
		        const nextMethod = asyncIterator.next;
		        return { iterator: asyncIterator, nextMethod, done: false };
		    }
		    // Aligns with core-js/modules/es.symbol.async-iterator.js
		    const SymbolAsyncIterator = (_c = (_a = Symbol.asyncIterator) !== null && _a !== void 0 ? _a : (_b = Symbol.for) === null || _b === void 0 ? void 0 : _b.call(Symbol, 'Symbol.asyncIterator')) !== null && _c !== void 0 ? _c : '@@asyncIterator';
		    function GetIterator(obj, hint = 'sync', method) {
		        if (method === undefined) {
		            if (hint === 'async') {
		                method = GetMethod(obj, SymbolAsyncIterator);
		                if (method === undefined) {
		                    const syncMethod = GetMethod(obj, Symbol.iterator);
		                    const syncIteratorRecord = GetIterator(obj, 'sync', syncMethod);
		                    return CreateAsyncFromSyncIterator(syncIteratorRecord);
		                }
		            }
		            else {
		                method = GetMethod(obj, Symbol.iterator);
		            }
		        }
		        if (method === undefined) {
		            throw new TypeError('The object is not iterable');
		        }
		        const iterator = reflectCall(method, obj, []);
		        if (!typeIsObject(iterator)) {
		            throw new TypeError('The iterator method must return an object');
		        }
		        const nextMethod = iterator.next;
		        return { iterator, nextMethod, done: false };
		    }
		    function IteratorNext(iteratorRecord) {
		        const result = reflectCall(iteratorRecord.nextMethod, iteratorRecord.iterator, []);
		        if (!typeIsObject(result)) {
		            throw new TypeError('The iterator.next() method must return an object');
		        }
		        return result;
		    }
		    function IteratorComplete(iterResult) {
		        return Boolean(iterResult.done);
		    }
		    function IteratorValue(iterResult) {
		        return iterResult.value;
		    }

		    function IsNonNegativeNumber(v) {
		        if (typeof v !== 'number') {
		            return false;
		        }
		        if (NumberIsNaN(v)) {
		            return false;
		        }
		        if (v < 0) {
		            return false;
		        }
		        return true;
		    }
		    function CloneAsUint8Array(O) {
		        const buffer = ArrayBufferSlice(O.buffer, O.byteOffset, O.byteOffset + O.byteLength);
		        return new Uint8Array(buffer);
		    }

		    function DequeueValue(container) {
		        const pair = container._queue.shift();
		        container._queueTotalSize -= pair.size;
		        if (container._queueTotalSize < 0) {
		            container._queueTotalSize = 0;
		        }
		        return pair.value;
		    }
		    function EnqueueValueWithSize(container, value, size) {
		        if (!IsNonNegativeNumber(size) || size === Infinity) {
		            throw new RangeError('Size must be a finite, non-NaN, non-negative number.');
		        }
		        container._queue.push({ value, size });
		        container._queueTotalSize += size;
		    }
		    function PeekQueueValue(container) {
		        const pair = container._queue.peek();
		        return pair.value;
		    }
		    function ResetQueue(container) {
		        container._queue = new SimpleQueue();
		        container._queueTotalSize = 0;
		    }

		    function isDataViewConstructor(ctor) {
		        return ctor === DataView;
		    }
		    function isDataView(view) {
		        return isDataViewConstructor(view.constructor);
		    }
		    function arrayBufferViewElementSize(ctor) {
		        if (isDataViewConstructor(ctor)) {
		            return 1;
		        }
		        return ctor.BYTES_PER_ELEMENT;
		    }

		    /**
		     * A pull-into request in a {@link ReadableByteStreamController}.
		     *
		     * @public
		     */
		    class ReadableStreamBYOBRequest {
		        constructor() {
		            throw new TypeError('Illegal constructor');
		        }
		        /**
		         * Returns the view for writing in to, or `null` if the BYOB request has already been responded to.
		         */
		        get view() {
		            if (!IsReadableStreamBYOBRequest(this)) {
		                throw byobRequestBrandCheckException('view');
		            }
		            return this._view;
		        }
		        respond(bytesWritten) {
		            if (!IsReadableStreamBYOBRequest(this)) {
		                throw byobRequestBrandCheckException('respond');
		            }
		            assertRequiredArgument(bytesWritten, 1, 'respond');
		            bytesWritten = convertUnsignedLongLongWithEnforceRange(bytesWritten, 'First parameter');
		            if (this._associatedReadableByteStreamController === undefined) {
		                throw new TypeError('This BYOB request has been invalidated');
		            }
		            if (IsDetachedBuffer(this._view.buffer)) {
		                throw new TypeError(`The BYOB request's buffer has been detached and so cannot be used as a response`);
		            }
		            ReadableByteStreamControllerRespond(this._associatedReadableByteStreamController, bytesWritten);
		        }
		        respondWithNewView(view) {
		            if (!IsReadableStreamBYOBRequest(this)) {
		                throw byobRequestBrandCheckException('respondWithNewView');
		            }
		            assertRequiredArgument(view, 1, 'respondWithNewView');
		            if (!ArrayBuffer.isView(view)) {
		                throw new TypeError('You can only respond with array buffer views');
		            }
		            if (this._associatedReadableByteStreamController === undefined) {
		                throw new TypeError('This BYOB request has been invalidated');
		            }
		            if (IsDetachedBuffer(view.buffer)) {
		                throw new TypeError('The given view\'s buffer has been detached and so cannot be used as a response');
		            }
		            ReadableByteStreamControllerRespondWithNewView(this._associatedReadableByteStreamController, view);
		        }
		    }
		    Object.defineProperties(ReadableStreamBYOBRequest.prototype, {
		        respond: { enumerable: true },
		        respondWithNewView: { enumerable: true },
		        view: { enumerable: true }
		    });
		    setFunctionName(ReadableStreamBYOBRequest.prototype.respond, 'respond');
		    setFunctionName(ReadableStreamBYOBRequest.prototype.respondWithNewView, 'respondWithNewView');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(ReadableStreamBYOBRequest.prototype, Symbol.toStringTag, {
		            value: 'ReadableStreamBYOBRequest',
		            configurable: true
		        });
		    }
		    /**
		     * Allows control of a {@link ReadableStream | readable byte stream}'s state and internal queue.
		     *
		     * @public
		     */
		    class ReadableByteStreamController {
		        constructor() {
		            throw new TypeError('Illegal constructor');
		        }
		        /**
		         * Returns the current BYOB pull request, or `null` if there isn't one.
		         */
		        get byobRequest() {
		            if (!IsReadableByteStreamController(this)) {
		                throw byteStreamControllerBrandCheckException('byobRequest');
		            }
		            return ReadableByteStreamControllerGetBYOBRequest(this);
		        }
		        /**
		         * Returns the desired size to fill the controlled stream's internal queue. It can be negative, if the queue is
		         * over-full. An underlying byte source ought to use this information to determine when and how to apply backpressure.
		         */
		        get desiredSize() {
		            if (!IsReadableByteStreamController(this)) {
		                throw byteStreamControllerBrandCheckException('desiredSize');
		            }
		            return ReadableByteStreamControllerGetDesiredSize(this);
		        }
		        /**
		         * Closes the controlled readable stream. Consumers will still be able to read any previously-enqueued chunks from
		         * the stream, but once those are read, the stream will become closed.
		         */
		        close() {
		            if (!IsReadableByteStreamController(this)) {
		                throw byteStreamControllerBrandCheckException('close');
		            }
		            if (this._closeRequested) {
		                throw new TypeError('The stream has already been closed; do not close it again!');
		            }
		            const state = this._controlledReadableByteStream._state;
		            if (state !== 'readable') {
		                throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be closed`);
		            }
		            ReadableByteStreamControllerClose(this);
		        }
		        enqueue(chunk) {
		            if (!IsReadableByteStreamController(this)) {
		                throw byteStreamControllerBrandCheckException('enqueue');
		            }
		            assertRequiredArgument(chunk, 1, 'enqueue');
		            if (!ArrayBuffer.isView(chunk)) {
		                throw new TypeError('chunk must be an array buffer view');
		            }
		            if (chunk.byteLength === 0) {
		                throw new TypeError('chunk must have non-zero byteLength');
		            }
		            if (chunk.buffer.byteLength === 0) {
		                throw new TypeError(`chunk's buffer must have non-zero byteLength`);
		            }
		            if (this._closeRequested) {
		                throw new TypeError('stream is closed or draining');
		            }
		            const state = this._controlledReadableByteStream._state;
		            if (state !== 'readable') {
		                throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be enqueued to`);
		            }
		            ReadableByteStreamControllerEnqueue(this, chunk);
		        }
		        /**
		         * Errors the controlled readable stream, making all future interactions with it fail with the given error `e`.
		         */
		        error(e = undefined) {
		            if (!IsReadableByteStreamController(this)) {
		                throw byteStreamControllerBrandCheckException('error');
		            }
		            ReadableByteStreamControllerError(this, e);
		        }
		        /** @internal */
		        [CancelSteps](reason) {
		            ReadableByteStreamControllerClearPendingPullIntos(this);
		            ResetQueue(this);
		            const result = this._cancelAlgorithm(reason);
		            ReadableByteStreamControllerClearAlgorithms(this);
		            return result;
		        }
		        /** @internal */
		        [PullSteps](readRequest) {
		            const stream = this._controlledReadableByteStream;
		            if (this._queueTotalSize > 0) {
		                ReadableByteStreamControllerFillReadRequestFromQueue(this, readRequest);
		                return;
		            }
		            const autoAllocateChunkSize = this._autoAllocateChunkSize;
		            if (autoAllocateChunkSize !== undefined) {
		                let buffer;
		                try {
		                    buffer = new ArrayBuffer(autoAllocateChunkSize);
		                }
		                catch (bufferE) {
		                    readRequest._errorSteps(bufferE);
		                    return;
		                }
		                const pullIntoDescriptor = {
		                    buffer,
		                    bufferByteLength: autoAllocateChunkSize,
		                    byteOffset: 0,
		                    byteLength: autoAllocateChunkSize,
		                    bytesFilled: 0,
		                    minimumFill: 1,
		                    elementSize: 1,
		                    viewConstructor: Uint8Array,
		                    readerType: 'default'
		                };
		                this._pendingPullIntos.push(pullIntoDescriptor);
		            }
		            ReadableStreamAddReadRequest(stream, readRequest);
		            ReadableByteStreamControllerCallPullIfNeeded(this);
		        }
		        /** @internal */
		        [ReleaseSteps]() {
		            if (this._pendingPullIntos.length > 0) {
		                const firstPullInto = this._pendingPullIntos.peek();
		                firstPullInto.readerType = 'none';
		                this._pendingPullIntos = new SimpleQueue();
		                this._pendingPullIntos.push(firstPullInto);
		            }
		        }
		    }
		    Object.defineProperties(ReadableByteStreamController.prototype, {
		        close: { enumerable: true },
		        enqueue: { enumerable: true },
		        error: { enumerable: true },
		        byobRequest: { enumerable: true },
		        desiredSize: { enumerable: true }
		    });
		    setFunctionName(ReadableByteStreamController.prototype.close, 'close');
		    setFunctionName(ReadableByteStreamController.prototype.enqueue, 'enqueue');
		    setFunctionName(ReadableByteStreamController.prototype.error, 'error');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(ReadableByteStreamController.prototype, Symbol.toStringTag, {
		            value: 'ReadableByteStreamController',
		            configurable: true
		        });
		    }
		    // Abstract operations for the ReadableByteStreamController.
		    function IsReadableByteStreamController(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableByteStream')) {
		            return false;
		        }
		        return x instanceof ReadableByteStreamController;
		    }
		    function IsReadableStreamBYOBRequest(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_associatedReadableByteStreamController')) {
		            return false;
		        }
		        return x instanceof ReadableStreamBYOBRequest;
		    }
		    function ReadableByteStreamControllerCallPullIfNeeded(controller) {
		        const shouldPull = ReadableByteStreamControllerShouldCallPull(controller);
		        if (!shouldPull) {
		            return;
		        }
		        if (controller._pulling) {
		            controller._pullAgain = true;
		            return;
		        }
		        controller._pulling = true;
		        // TODO: Test controller argument
		        const pullPromise = controller._pullAlgorithm();
		        uponPromise(pullPromise, () => {
		            controller._pulling = false;
		            if (controller._pullAgain) {
		                controller._pullAgain = false;
		                ReadableByteStreamControllerCallPullIfNeeded(controller);
		            }
		            return null;
		        }, e => {
		            ReadableByteStreamControllerError(controller, e);
		            return null;
		        });
		    }
		    function ReadableByteStreamControllerClearPendingPullIntos(controller) {
		        ReadableByteStreamControllerInvalidateBYOBRequest(controller);
		        controller._pendingPullIntos = new SimpleQueue();
		    }
		    function ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor) {
		        let done = false;
		        if (stream._state === 'closed') {
		            done = true;
		        }
		        const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);
		        if (pullIntoDescriptor.readerType === 'default') {
		            ReadableStreamFulfillReadRequest(stream, filledView, done);
		        }
		        else {
		            ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
		        }
		    }
		    function ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor) {
		        const bytesFilled = pullIntoDescriptor.bytesFilled;
		        const elementSize = pullIntoDescriptor.elementSize;
		        return new pullIntoDescriptor.viewConstructor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, bytesFilled / elementSize);
		    }
		    function ReadableByteStreamControllerEnqueueChunkToQueue(controller, buffer, byteOffset, byteLength) {
		        controller._queue.push({ buffer, byteOffset, byteLength });
		        controller._queueTotalSize += byteLength;
		    }
		    function ReadableByteStreamControllerEnqueueClonedChunkToQueue(controller, buffer, byteOffset, byteLength) {
		        let clonedChunk;
		        try {
		            clonedChunk = ArrayBufferSlice(buffer, byteOffset, byteOffset + byteLength);
		        }
		        catch (cloneE) {
		            ReadableByteStreamControllerError(controller, cloneE);
		            throw cloneE;
		        }
		        ReadableByteStreamControllerEnqueueChunkToQueue(controller, clonedChunk, 0, byteLength);
		    }
		    function ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(controller, firstDescriptor) {
		        if (firstDescriptor.bytesFilled > 0) {
		            ReadableByteStreamControllerEnqueueClonedChunkToQueue(controller, firstDescriptor.buffer, firstDescriptor.byteOffset, firstDescriptor.bytesFilled);
		        }
		        ReadableByteStreamControllerShiftPendingPullInto(controller);
		    }
		    function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) {
		        const maxBytesToCopy = Math.min(controller._queueTotalSize, pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled);
		        const maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;
		        let totalBytesToCopyRemaining = maxBytesToCopy;
		        let ready = false;
		        const remainderBytes = maxBytesFilled % pullIntoDescriptor.elementSize;
		        const maxAlignedBytes = maxBytesFilled - remainderBytes;
		        // A descriptor for a read() request that is not yet filled up to its minimum length will stay at the head
		        // of the queue, so the underlying source can keep filling it.
		        if (maxAlignedBytes >= pullIntoDescriptor.minimumFill) {
		            totalBytesToCopyRemaining = maxAlignedBytes - pullIntoDescriptor.bytesFilled;
		            ready = true;
		        }
		        const queue = controller._queue;
		        while (totalBytesToCopyRemaining > 0) {
		            const headOfQueue = queue.peek();
		            const bytesToCopy = Math.min(totalBytesToCopyRemaining, headOfQueue.byteLength);
		            const destStart = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
		            CopyDataBlockBytes(pullIntoDescriptor.buffer, destStart, headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy);
		            if (headOfQueue.byteLength === bytesToCopy) {
		                queue.shift();
		            }
		            else {
		                headOfQueue.byteOffset += bytesToCopy;
		                headOfQueue.byteLength -= bytesToCopy;
		            }
		            controller._queueTotalSize -= bytesToCopy;
		            ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesToCopy, pullIntoDescriptor);
		            totalBytesToCopyRemaining -= bytesToCopy;
		        }
		        return ready;
		    }
		    function ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, size, pullIntoDescriptor) {
		        pullIntoDescriptor.bytesFilled += size;
		    }
		    function ReadableByteStreamControllerHandleQueueDrain(controller) {
		        if (controller._queueTotalSize === 0 && controller._closeRequested) {
		            ReadableByteStreamControllerClearAlgorithms(controller);
		            ReadableStreamClose(controller._controlledReadableByteStream);
		        }
		        else {
		            ReadableByteStreamControllerCallPullIfNeeded(controller);
		        }
		    }
		    function ReadableByteStreamControllerInvalidateBYOBRequest(controller) {
		        if (controller._byobRequest === null) {
		            return;
		        }
		        controller._byobRequest._associatedReadableByteStreamController = undefined;
		        controller._byobRequest._view = null;
		        controller._byobRequest = null;
		    }
		    function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller) {
		        while (controller._pendingPullIntos.length > 0) {
		            if (controller._queueTotalSize === 0) {
		                return;
		            }
		            const pullIntoDescriptor = controller._pendingPullIntos.peek();
		            if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor)) {
		                ReadableByteStreamControllerShiftPendingPullInto(controller);
		                ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableByteStream, pullIntoDescriptor);
		            }
		        }
		    }
		    function ReadableByteStreamControllerProcessReadRequestsUsingQueue(controller) {
		        const reader = controller._controlledReadableByteStream._reader;
		        while (reader._readRequests.length > 0) {
		            if (controller._queueTotalSize === 0) {
		                return;
		            }
		            const readRequest = reader._readRequests.shift();
		            ReadableByteStreamControllerFillReadRequestFromQueue(controller, readRequest);
		        }
		    }
		    function ReadableByteStreamControllerPullInto(controller, view, min, readIntoRequest) {
		        const stream = controller._controlledReadableByteStream;
		        const ctor = view.constructor;
		        const elementSize = arrayBufferViewElementSize(ctor);
		        const { byteOffset, byteLength } = view;
		        const minimumFill = min * elementSize;
		        let buffer;
		        try {
		            buffer = TransferArrayBuffer(view.buffer);
		        }
		        catch (e) {
		            readIntoRequest._errorSteps(e);
		            return;
		        }
		        const pullIntoDescriptor = {
		            buffer,
		            bufferByteLength: buffer.byteLength,
		            byteOffset,
		            byteLength,
		            bytesFilled: 0,
		            minimumFill,
		            elementSize,
		            viewConstructor: ctor,
		            readerType: 'byob'
		        };
		        if (controller._pendingPullIntos.length > 0) {
		            controller._pendingPullIntos.push(pullIntoDescriptor);
		            // No ReadableByteStreamControllerCallPullIfNeeded() call since:
		            // - No change happens on desiredSize
		            // - The source has already been notified of that there's at least 1 pending read(view)
		            ReadableStreamAddReadIntoRequest(stream, readIntoRequest);
		            return;
		        }
		        if (stream._state === 'closed') {
		            const emptyView = new ctor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, 0);
		            readIntoRequest._closeSteps(emptyView);
		            return;
		        }
		        if (controller._queueTotalSize > 0) {
		            if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor)) {
		                const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);
		                ReadableByteStreamControllerHandleQueueDrain(controller);
		                readIntoRequest._chunkSteps(filledView);
		                return;
		            }
		            if (controller._closeRequested) {
		                const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
		                ReadableByteStreamControllerError(controller, e);
		                readIntoRequest._errorSteps(e);
		                return;
		            }
		        }
		        controller._pendingPullIntos.push(pullIntoDescriptor);
		        ReadableStreamAddReadIntoRequest(stream, readIntoRequest);
		        ReadableByteStreamControllerCallPullIfNeeded(controller);
		    }
		    function ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor) {
		        if (firstDescriptor.readerType === 'none') {
		            ReadableByteStreamControllerShiftPendingPullInto(controller);
		        }
		        const stream = controller._controlledReadableByteStream;
		        if (ReadableStreamHasBYOBReader(stream)) {
		            while (ReadableStreamGetNumReadIntoRequests(stream) > 0) {
		                const pullIntoDescriptor = ReadableByteStreamControllerShiftPendingPullInto(controller);
		                ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor);
		            }
		        }
		    }
		    function ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, pullIntoDescriptor) {
		        ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesWritten, pullIntoDescriptor);
		        if (pullIntoDescriptor.readerType === 'none') {
		            ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(controller, pullIntoDescriptor);
		            ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
		            return;
		        }
		        if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.minimumFill) {
		            // A descriptor for a read() request that is not yet filled up to its minimum length will stay at the head
		            // of the queue, so the underlying source can keep filling it.
		            return;
		        }
		        ReadableByteStreamControllerShiftPendingPullInto(controller);
		        const remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
		        if (remainderSize > 0) {
		            const end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
		            ReadableByteStreamControllerEnqueueClonedChunkToQueue(controller, pullIntoDescriptor.buffer, end - remainderSize, remainderSize);
		        }
		        pullIntoDescriptor.bytesFilled -= remainderSize;
		        ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableByteStream, pullIntoDescriptor);
		        ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
		    }
		    function ReadableByteStreamControllerRespondInternal(controller, bytesWritten) {
		        const firstDescriptor = controller._pendingPullIntos.peek();
		        ReadableByteStreamControllerInvalidateBYOBRequest(controller);
		        const state = controller._controlledReadableByteStream._state;
		        if (state === 'closed') {
		            ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor);
		        }
		        else {
		            ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, firstDescriptor);
		        }
		        ReadableByteStreamControllerCallPullIfNeeded(controller);
		    }
		    function ReadableByteStreamControllerShiftPendingPullInto(controller) {
		        const descriptor = controller._pendingPullIntos.shift();
		        return descriptor;
		    }
		    function ReadableByteStreamControllerShouldCallPull(controller) {
		        const stream = controller._controlledReadableByteStream;
		        if (stream._state !== 'readable') {
		            return false;
		        }
		        if (controller._closeRequested) {
		            return false;
		        }
		        if (!controller._started) {
		            return false;
		        }
		        if (ReadableStreamHasDefaultReader(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
		            return true;
		        }
		        if (ReadableStreamHasBYOBReader(stream) && ReadableStreamGetNumReadIntoRequests(stream) > 0) {
		            return true;
		        }
		        const desiredSize = ReadableByteStreamControllerGetDesiredSize(controller);
		        if (desiredSize > 0) {
		            return true;
		        }
		        return false;
		    }
		    function ReadableByteStreamControllerClearAlgorithms(controller) {
		        controller._pullAlgorithm = undefined;
		        controller._cancelAlgorithm = undefined;
		    }
		    // A client of ReadableByteStreamController may use these functions directly to bypass state check.
		    function ReadableByteStreamControllerClose(controller) {
		        const stream = controller._controlledReadableByteStream;
		        if (controller._closeRequested || stream._state !== 'readable') {
		            return;
		        }
		        if (controller._queueTotalSize > 0) {
		            controller._closeRequested = true;
		            return;
		        }
		        if (controller._pendingPullIntos.length > 0) {
		            const firstPendingPullInto = controller._pendingPullIntos.peek();
		            if (firstPendingPullInto.bytesFilled % firstPendingPullInto.elementSize !== 0) {
		                const e = new TypeError('Insufficient bytes to fill elements in the given buffer');
		                ReadableByteStreamControllerError(controller, e);
		                throw e;
		            }
		        }
		        ReadableByteStreamControllerClearAlgorithms(controller);
		        ReadableStreamClose(stream);
		    }
		    function ReadableByteStreamControllerEnqueue(controller, chunk) {
		        const stream = controller._controlledReadableByteStream;
		        if (controller._closeRequested || stream._state !== 'readable') {
		            return;
		        }
		        const { buffer, byteOffset, byteLength } = chunk;
		        if (IsDetachedBuffer(buffer)) {
		            throw new TypeError('chunk\'s buffer is detached and so cannot be enqueued');
		        }
		        const transferredBuffer = TransferArrayBuffer(buffer);
		        if (controller._pendingPullIntos.length > 0) {
		            const firstPendingPullInto = controller._pendingPullIntos.peek();
		            if (IsDetachedBuffer(firstPendingPullInto.buffer)) {
		                throw new TypeError('The BYOB request\'s buffer has been detached and so cannot be filled with an enqueued chunk');
		            }
		            ReadableByteStreamControllerInvalidateBYOBRequest(controller);
		            firstPendingPullInto.buffer = TransferArrayBuffer(firstPendingPullInto.buffer);
		            if (firstPendingPullInto.readerType === 'none') {
		                ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(controller, firstPendingPullInto);
		            }
		        }
		        if (ReadableStreamHasDefaultReader(stream)) {
		            ReadableByteStreamControllerProcessReadRequestsUsingQueue(controller);
		            if (ReadableStreamGetNumReadRequests(stream) === 0) {
		                ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
		            }
		            else {
		                if (controller._pendingPullIntos.length > 0) {
		                    ReadableByteStreamControllerShiftPendingPullInto(controller);
		                }
		                const transferredView = new Uint8Array(transferredBuffer, byteOffset, byteLength);
		                ReadableStreamFulfillReadRequest(stream, transferredView, false);
		            }
		        }
		        else if (ReadableStreamHasBYOBReader(stream)) {
		            // TODO: Ideally in this branch detaching should happen only if the buffer is not consumed fully.
		            ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
		            ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
		        }
		        else {
		            ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
		        }
		        ReadableByteStreamControllerCallPullIfNeeded(controller);
		    }
		    function ReadableByteStreamControllerError(controller, e) {
		        const stream = controller._controlledReadableByteStream;
		        if (stream._state !== 'readable') {
		            return;
		        }
		        ReadableByteStreamControllerClearPendingPullIntos(controller);
		        ResetQueue(controller);
		        ReadableByteStreamControllerClearAlgorithms(controller);
		        ReadableStreamError(stream, e);
		    }
		    function ReadableByteStreamControllerFillReadRequestFromQueue(controller, readRequest) {
		        const entry = controller._queue.shift();
		        controller._queueTotalSize -= entry.byteLength;
		        ReadableByteStreamControllerHandleQueueDrain(controller);
		        const view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
		        readRequest._chunkSteps(view);
		    }
		    function ReadableByteStreamControllerGetBYOBRequest(controller) {
		        if (controller._byobRequest === null && controller._pendingPullIntos.length > 0) {
		            const firstDescriptor = controller._pendingPullIntos.peek();
		            const view = new Uint8Array(firstDescriptor.buffer, firstDescriptor.byteOffset + firstDescriptor.bytesFilled, firstDescriptor.byteLength - firstDescriptor.bytesFilled);
		            const byobRequest = Object.create(ReadableStreamBYOBRequest.prototype);
		            SetUpReadableStreamBYOBRequest(byobRequest, controller, view);
		            controller._byobRequest = byobRequest;
		        }
		        return controller._byobRequest;
		    }
		    function ReadableByteStreamControllerGetDesiredSize(controller) {
		        const state = controller._controlledReadableByteStream._state;
		        if (state === 'errored') {
		            return null;
		        }
		        if (state === 'closed') {
		            return 0;
		        }
		        return controller._strategyHWM - controller._queueTotalSize;
		    }
		    function ReadableByteStreamControllerRespond(controller, bytesWritten) {
		        const firstDescriptor = controller._pendingPullIntos.peek();
		        const state = controller._controlledReadableByteStream._state;
		        if (state === 'closed') {
		            if (bytesWritten !== 0) {
		                throw new TypeError('bytesWritten must be 0 when calling respond() on a closed stream');
		            }
		        }
		        else {
		            if (bytesWritten === 0) {
		                throw new TypeError('bytesWritten must be greater than 0 when calling respond() on a readable stream');
		            }
		            if (firstDescriptor.bytesFilled + bytesWritten > firstDescriptor.byteLength) {
		                throw new RangeError('bytesWritten out of range');
		            }
		        }
		        firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);
		        ReadableByteStreamControllerRespondInternal(controller, bytesWritten);
		    }
		    function ReadableByteStreamControllerRespondWithNewView(controller, view) {
		        const firstDescriptor = controller._pendingPullIntos.peek();
		        const state = controller._controlledReadableByteStream._state;
		        if (state === 'closed') {
		            if (view.byteLength !== 0) {
		                throw new TypeError('The view\'s length must be 0 when calling respondWithNewView() on a closed stream');
		            }
		        }
		        else {
		            if (view.byteLength === 0) {
		                throw new TypeError('The view\'s length must be greater than 0 when calling respondWithNewView() on a readable stream');
		            }
		        }
		        if (firstDescriptor.byteOffset + firstDescriptor.bytesFilled !== view.byteOffset) {
		            throw new RangeError('The region specified by view does not match byobRequest');
		        }
		        if (firstDescriptor.bufferByteLength !== view.buffer.byteLength) {
		            throw new RangeError('The buffer of view has different capacity than byobRequest');
		        }
		        if (firstDescriptor.bytesFilled + view.byteLength > firstDescriptor.byteLength) {
		            throw new RangeError('The region specified by view is larger than byobRequest');
		        }
		        const viewByteLength = view.byteLength;
		        firstDescriptor.buffer = TransferArrayBuffer(view.buffer);
		        ReadableByteStreamControllerRespondInternal(controller, viewByteLength);
		    }
		    function SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize) {
		        controller._controlledReadableByteStream = stream;
		        controller._pullAgain = false;
		        controller._pulling = false;
		        controller._byobRequest = null;
		        // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
		        controller._queue = controller._queueTotalSize = undefined;
		        ResetQueue(controller);
		        controller._closeRequested = false;
		        controller._started = false;
		        controller._strategyHWM = highWaterMark;
		        controller._pullAlgorithm = pullAlgorithm;
		        controller._cancelAlgorithm = cancelAlgorithm;
		        controller._autoAllocateChunkSize = autoAllocateChunkSize;
		        controller._pendingPullIntos = new SimpleQueue();
		        stream._readableStreamController = controller;
		        const startResult = startAlgorithm();
		        uponPromise(promiseResolvedWith(startResult), () => {
		            controller._started = true;
		            ReadableByteStreamControllerCallPullIfNeeded(controller);
		            return null;
		        }, r => {
		            ReadableByteStreamControllerError(controller, r);
		            return null;
		        });
		    }
		    function SetUpReadableByteStreamControllerFromUnderlyingSource(stream, underlyingByteSource, highWaterMark) {
		        const controller = Object.create(ReadableByteStreamController.prototype);
		        let startAlgorithm;
		        let pullAlgorithm;
		        let cancelAlgorithm;
		        if (underlyingByteSource.start !== undefined) {
		            startAlgorithm = () => underlyingByteSource.start(controller);
		        }
		        else {
		            startAlgorithm = () => undefined;
		        }
		        if (underlyingByteSource.pull !== undefined) {
		            pullAlgorithm = () => underlyingByteSource.pull(controller);
		        }
		        else {
		            pullAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        if (underlyingByteSource.cancel !== undefined) {
		            cancelAlgorithm = reason => underlyingByteSource.cancel(reason);
		        }
		        else {
		            cancelAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        const autoAllocateChunkSize = underlyingByteSource.autoAllocateChunkSize;
		        if (autoAllocateChunkSize === 0) {
		            throw new TypeError('autoAllocateChunkSize must be greater than 0');
		        }
		        SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize);
		    }
		    function SetUpReadableStreamBYOBRequest(request, controller, view) {
		        request._associatedReadableByteStreamController = controller;
		        request._view = view;
		    }
		    // Helper functions for the ReadableStreamBYOBRequest.
		    function byobRequestBrandCheckException(name) {
		        return new TypeError(`ReadableStreamBYOBRequest.prototype.${name} can only be used on a ReadableStreamBYOBRequest`);
		    }
		    // Helper functions for the ReadableByteStreamController.
		    function byteStreamControllerBrandCheckException(name) {
		        return new TypeError(`ReadableByteStreamController.prototype.${name} can only be used on a ReadableByteStreamController`);
		    }

		    function convertReaderOptions(options, context) {
		        assertDictionary(options, context);
		        const mode = options === null || options === void 0 ? void 0 : options.mode;
		        return {
		            mode: mode === undefined ? undefined : convertReadableStreamReaderMode(mode, `${context} has member 'mode' that`)
		        };
		    }
		    function convertReadableStreamReaderMode(mode, context) {
		        mode = `${mode}`;
		        if (mode !== 'byob') {
		            throw new TypeError(`${context} '${mode}' is not a valid enumeration value for ReadableStreamReaderMode`);
		        }
		        return mode;
		    }
		    function convertByobReadOptions(options, context) {
		        var _a;
		        assertDictionary(options, context);
		        const min = (_a = options === null || options === void 0 ? void 0 : options.min) !== null && _a !== void 0 ? _a : 1;
		        return {
		            min: convertUnsignedLongLongWithEnforceRange(min, `${context} has member 'min' that`)
		        };
		    }

		    // Abstract operations for the ReadableStream.
		    function AcquireReadableStreamBYOBReader(stream) {
		        return new ReadableStreamBYOBReader(stream);
		    }
		    // ReadableStream API exposed for controllers.
		    function ReadableStreamAddReadIntoRequest(stream, readIntoRequest) {
		        stream._reader._readIntoRequests.push(readIntoRequest);
		    }
		    function ReadableStreamFulfillReadIntoRequest(stream, chunk, done) {
		        const reader = stream._reader;
		        const readIntoRequest = reader._readIntoRequests.shift();
		        if (done) {
		            readIntoRequest._closeSteps(chunk);
		        }
		        else {
		            readIntoRequest._chunkSteps(chunk);
		        }
		    }
		    function ReadableStreamGetNumReadIntoRequests(stream) {
		        return stream._reader._readIntoRequests.length;
		    }
		    function ReadableStreamHasBYOBReader(stream) {
		        const reader = stream._reader;
		        if (reader === undefined) {
		            return false;
		        }
		        if (!IsReadableStreamBYOBReader(reader)) {
		            return false;
		        }
		        return true;
		    }
		    /**
		     * A BYOB reader vended by a {@link ReadableStream}.
		     *
		     * @public
		     */
		    class ReadableStreamBYOBReader {
		        constructor(stream) {
		            assertRequiredArgument(stream, 1, 'ReadableStreamBYOBReader');
		            assertReadableStream(stream, 'First parameter');
		            if (IsReadableStreamLocked(stream)) {
		                throw new TypeError('This stream has already been locked for exclusive reading by another reader');
		            }
		            if (!IsReadableByteStreamController(stream._readableStreamController)) {
		                throw new TypeError('Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte ' +
		                    'source');
		            }
		            ReadableStreamReaderGenericInitialize(this, stream);
		            this._readIntoRequests = new SimpleQueue();
		        }
		        /**
		         * Returns a promise that will be fulfilled when the stream becomes closed, or rejected if the stream ever errors or
		         * the reader's lock is released before the stream finishes closing.
		         */
		        get closed() {
		            if (!IsReadableStreamBYOBReader(this)) {
		                return promiseRejectedWith(byobReaderBrandCheckException('closed'));
		            }
		            return this._closedPromise;
		        }
		        /**
		         * If the reader is active, behaves the same as {@link ReadableStream.cancel | stream.cancel(reason)}.
		         */
		        cancel(reason = undefined) {
		            if (!IsReadableStreamBYOBReader(this)) {
		                return promiseRejectedWith(byobReaderBrandCheckException('cancel'));
		            }
		            if (this._ownerReadableStream === undefined) {
		                return promiseRejectedWith(readerLockException('cancel'));
		            }
		            return ReadableStreamReaderGenericCancel(this, reason);
		        }
		        read(view, rawOptions = {}) {
		            if (!IsReadableStreamBYOBReader(this)) {
		                return promiseRejectedWith(byobReaderBrandCheckException('read'));
		            }
		            if (!ArrayBuffer.isView(view)) {
		                return promiseRejectedWith(new TypeError('view must be an array buffer view'));
		            }
		            if (view.byteLength === 0) {
		                return promiseRejectedWith(new TypeError('view must have non-zero byteLength'));
		            }
		            if (view.buffer.byteLength === 0) {
		                return promiseRejectedWith(new TypeError(`view's buffer must have non-zero byteLength`));
		            }
		            if (IsDetachedBuffer(view.buffer)) {
		                return promiseRejectedWith(new TypeError('view\'s buffer has been detached'));
		            }
		            let options;
		            try {
		                options = convertByobReadOptions(rawOptions, 'options');
		            }
		            catch (e) {
		                return promiseRejectedWith(e);
		            }
		            const min = options.min;
		            if (min === 0) {
		                return promiseRejectedWith(new TypeError('options.min must be greater than 0'));
		            }
		            if (!isDataView(view)) {
		                if (min > view.length) {
		                    return promiseRejectedWith(new RangeError('options.min must be less than or equal to view\'s length'));
		                }
		            }
		            else if (min > view.byteLength) {
		                return promiseRejectedWith(new RangeError('options.min must be less than or equal to view\'s byteLength'));
		            }
		            if (this._ownerReadableStream === undefined) {
		                return promiseRejectedWith(readerLockException('read from'));
		            }
		            let resolvePromise;
		            let rejectPromise;
		            const promise = newPromise((resolve, reject) => {
		                resolvePromise = resolve;
		                rejectPromise = reject;
		            });
		            const readIntoRequest = {
		                _chunkSteps: chunk => resolvePromise({ value: chunk, done: false }),
		                _closeSteps: chunk => resolvePromise({ value: chunk, done: true }),
		                _errorSteps: e => rejectPromise(e)
		            };
		            ReadableStreamBYOBReaderRead(this, view, min, readIntoRequest);
		            return promise;
		        }
		        /**
		         * Releases the reader's lock on the corresponding stream. After the lock is released, the reader is no longer active.
		         * If the associated stream is errored when the lock is released, the reader will appear errored in the same way
		         * from now on; otherwise, the reader will appear closed.
		         *
		         * A reader's lock cannot be released while it still has a pending read request, i.e., if a promise returned by
		         * the reader's {@link ReadableStreamBYOBReader.read | read()} method has not yet been settled. Attempting to
		         * do so will throw a `TypeError` and leave the reader locked to the stream.
		         */
		        releaseLock() {
		            if (!IsReadableStreamBYOBReader(this)) {
		                throw byobReaderBrandCheckException('releaseLock');
		            }
		            if (this._ownerReadableStream === undefined) {
		                return;
		            }
		            ReadableStreamBYOBReaderRelease(this);
		        }
		    }
		    Object.defineProperties(ReadableStreamBYOBReader.prototype, {
		        cancel: { enumerable: true },
		        read: { enumerable: true },
		        releaseLock: { enumerable: true },
		        closed: { enumerable: true }
		    });
		    setFunctionName(ReadableStreamBYOBReader.prototype.cancel, 'cancel');
		    setFunctionName(ReadableStreamBYOBReader.prototype.read, 'read');
		    setFunctionName(ReadableStreamBYOBReader.prototype.releaseLock, 'releaseLock');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(ReadableStreamBYOBReader.prototype, Symbol.toStringTag, {
		            value: 'ReadableStreamBYOBReader',
		            configurable: true
		        });
		    }
		    // Abstract operations for the readers.
		    function IsReadableStreamBYOBReader(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_readIntoRequests')) {
		            return false;
		        }
		        return x instanceof ReadableStreamBYOBReader;
		    }
		    function ReadableStreamBYOBReaderRead(reader, view, min, readIntoRequest) {
		        const stream = reader._ownerReadableStream;
		        stream._disturbed = true;
		        if (stream._state === 'errored') {
		            readIntoRequest._errorSteps(stream._storedError);
		        }
		        else {
		            ReadableByteStreamControllerPullInto(stream._readableStreamController, view, min, readIntoRequest);
		        }
		    }
		    function ReadableStreamBYOBReaderRelease(reader) {
		        ReadableStreamReaderGenericRelease(reader);
		        const e = new TypeError('Reader was released');
		        ReadableStreamBYOBReaderErrorReadIntoRequests(reader, e);
		    }
		    function ReadableStreamBYOBReaderErrorReadIntoRequests(reader, e) {
		        const readIntoRequests = reader._readIntoRequests;
		        reader._readIntoRequests = new SimpleQueue();
		        readIntoRequests.forEach(readIntoRequest => {
		            readIntoRequest._errorSteps(e);
		        });
		    }
		    // Helper functions for the ReadableStreamBYOBReader.
		    function byobReaderBrandCheckException(name) {
		        return new TypeError(`ReadableStreamBYOBReader.prototype.${name} can only be used on a ReadableStreamBYOBReader`);
		    }

		    function ExtractHighWaterMark(strategy, defaultHWM) {
		        const { highWaterMark } = strategy;
		        if (highWaterMark === undefined) {
		            return defaultHWM;
		        }
		        if (NumberIsNaN(highWaterMark) || highWaterMark < 0) {
		            throw new RangeError('Invalid highWaterMark');
		        }
		        return highWaterMark;
		    }
		    function ExtractSizeAlgorithm(strategy) {
		        const { size } = strategy;
		        if (!size) {
		            return () => 1;
		        }
		        return size;
		    }

		    function convertQueuingStrategy(init, context) {
		        assertDictionary(init, context);
		        const highWaterMark = init === null || init === void 0 ? void 0 : init.highWaterMark;
		        const size = init === null || init === void 0 ? void 0 : init.size;
		        return {
		            highWaterMark: highWaterMark === undefined ? undefined : convertUnrestrictedDouble(highWaterMark),
		            size: size === undefined ? undefined : convertQueuingStrategySize(size, `${context} has member 'size' that`)
		        };
		    }
		    function convertQueuingStrategySize(fn, context) {
		        assertFunction(fn, context);
		        return chunk => convertUnrestrictedDouble(fn(chunk));
		    }

		    function convertUnderlyingSink(original, context) {
		        assertDictionary(original, context);
		        const abort = original === null || original === void 0 ? void 0 : original.abort;
		        const close = original === null || original === void 0 ? void 0 : original.close;
		        const start = original === null || original === void 0 ? void 0 : original.start;
		        const type = original === null || original === void 0 ? void 0 : original.type;
		        const write = original === null || original === void 0 ? void 0 : original.write;
		        return {
		            abort: abort === undefined ?
		                undefined :
		                convertUnderlyingSinkAbortCallback(abort, original, `${context} has member 'abort' that`),
		            close: close === undefined ?
		                undefined :
		                convertUnderlyingSinkCloseCallback(close, original, `${context} has member 'close' that`),
		            start: start === undefined ?
		                undefined :
		                convertUnderlyingSinkStartCallback(start, original, `${context} has member 'start' that`),
		            write: write === undefined ?
		                undefined :
		                convertUnderlyingSinkWriteCallback(write, original, `${context} has member 'write' that`),
		            type
		        };
		    }
		    function convertUnderlyingSinkAbortCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (reason) => promiseCall(fn, original, [reason]);
		    }
		    function convertUnderlyingSinkCloseCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return () => promiseCall(fn, original, []);
		    }
		    function convertUnderlyingSinkStartCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (controller) => reflectCall(fn, original, [controller]);
		    }
		    function convertUnderlyingSinkWriteCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (chunk, controller) => promiseCall(fn, original, [chunk, controller]);
		    }

		    function assertWritableStream(x, context) {
		        if (!IsWritableStream(x)) {
		            throw new TypeError(`${context} is not a WritableStream.`);
		        }
		    }

		    function isAbortSignal(value) {
		        if (typeof value !== 'object' || value === null) {
		            return false;
		        }
		        try {
		            return typeof value.aborted === 'boolean';
		        }
		        catch (_a) {
		            // AbortSignal.prototype.aborted throws if its brand check fails
		            return false;
		        }
		    }
		    const supportsAbortController = typeof AbortController === 'function';
		    /**
		     * Construct a new AbortController, if supported by the platform.
		     *
		     * @internal
		     */
		    function createAbortController() {
		        if (supportsAbortController) {
		            return new AbortController();
		        }
		        return undefined;
		    }

		    /**
		     * A writable stream represents a destination for data, into which you can write.
		     *
		     * @public
		     */
		    class WritableStream {
		        constructor(rawUnderlyingSink = {}, rawStrategy = {}) {
		            if (rawUnderlyingSink === undefined) {
		                rawUnderlyingSink = null;
		            }
		            else {
		                assertObject(rawUnderlyingSink, 'First parameter');
		            }
		            const strategy = convertQueuingStrategy(rawStrategy, 'Second parameter');
		            const underlyingSink = convertUnderlyingSink(rawUnderlyingSink, 'First parameter');
		            InitializeWritableStream(this);
		            const type = underlyingSink.type;
		            if (type !== undefined) {
		                throw new RangeError('Invalid type is specified');
		            }
		            const sizeAlgorithm = ExtractSizeAlgorithm(strategy);
		            const highWaterMark = ExtractHighWaterMark(strategy, 1);
		            SetUpWritableStreamDefaultControllerFromUnderlyingSink(this, underlyingSink, highWaterMark, sizeAlgorithm);
		        }
		        /**
		         * Returns whether or not the writable stream is locked to a writer.
		         */
		        get locked() {
		            if (!IsWritableStream(this)) {
		                throw streamBrandCheckException$2('locked');
		            }
		            return IsWritableStreamLocked(this);
		        }
		        /**
		         * Aborts the stream, signaling that the producer can no longer successfully write to the stream and it is to be
		         * immediately moved to an errored state, with any queued-up writes discarded. This will also execute any abort
		         * mechanism of the underlying sink.
		         *
		         * The returned promise will fulfill if the stream shuts down successfully, or reject if the underlying sink signaled
		         * that there was an error doing so. Additionally, it will reject with a `TypeError` (without attempting to cancel
		         * the stream) if the stream is currently locked.
		         */
		        abort(reason = undefined) {
		            if (!IsWritableStream(this)) {
		                return promiseRejectedWith(streamBrandCheckException$2('abort'));
		            }
		            if (IsWritableStreamLocked(this)) {
		                return promiseRejectedWith(new TypeError('Cannot abort a stream that already has a writer'));
		            }
		            return WritableStreamAbort(this, reason);
		        }
		        /**
		         * Closes the stream. The underlying sink will finish processing any previously-written chunks, before invoking its
		         * close behavior. During this time any further attempts to write will fail (without erroring the stream).
		         *
		         * The method returns a promise that will fulfill if all remaining chunks are successfully written and the stream
		         * successfully closes, or rejects if an error is encountered during this process. Additionally, it will reject with
		         * a `TypeError` (without attempting to cancel the stream) if the stream is currently locked.
		         */
		        close() {
		            if (!IsWritableStream(this)) {
		                return promiseRejectedWith(streamBrandCheckException$2('close'));
		            }
		            if (IsWritableStreamLocked(this)) {
		                return promiseRejectedWith(new TypeError('Cannot close a stream that already has a writer'));
		            }
		            if (WritableStreamCloseQueuedOrInFlight(this)) {
		                return promiseRejectedWith(new TypeError('Cannot close an already-closing stream'));
		            }
		            return WritableStreamClose(this);
		        }
		        /**
		         * Creates a {@link WritableStreamDefaultWriter | writer} and locks the stream to the new writer. While the stream
		         * is locked, no other writer can be acquired until this one is released.
		         *
		         * This functionality is especially useful for creating abstractions that desire the ability to write to a stream
		         * without interruption or interleaving. By getting a writer for the stream, you can ensure nobody else can write at
		         * the same time, which would cause the resulting written data to be unpredictable and probably useless.
		         */
		        getWriter() {
		            if (!IsWritableStream(this)) {
		                throw streamBrandCheckException$2('getWriter');
		            }
		            return AcquireWritableStreamDefaultWriter(this);
		        }
		    }
		    Object.defineProperties(WritableStream.prototype, {
		        abort: { enumerable: true },
		        close: { enumerable: true },
		        getWriter: { enumerable: true },
		        locked: { enumerable: true }
		    });
		    setFunctionName(WritableStream.prototype.abort, 'abort');
		    setFunctionName(WritableStream.prototype.close, 'close');
		    setFunctionName(WritableStream.prototype.getWriter, 'getWriter');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(WritableStream.prototype, Symbol.toStringTag, {
		            value: 'WritableStream',
		            configurable: true
		        });
		    }
		    // Abstract operations for the WritableStream.
		    function AcquireWritableStreamDefaultWriter(stream) {
		        return new WritableStreamDefaultWriter(stream);
		    }
		    // Throws if and only if startAlgorithm throws.
		    function CreateWritableStream(startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark = 1, sizeAlgorithm = () => 1) {
		        const stream = Object.create(WritableStream.prototype);
		        InitializeWritableStream(stream);
		        const controller = Object.create(WritableStreamDefaultController.prototype);
		        SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark, sizeAlgorithm);
		        return stream;
		    }
		    function InitializeWritableStream(stream) {
		        stream._state = 'writable';
		        // The error that will be reported by new method calls once the state becomes errored. Only set when [[state]] is
		        // 'erroring' or 'errored'. May be set to an undefined value.
		        stream._storedError = undefined;
		        stream._writer = undefined;
		        // Initialize to undefined first because the constructor of the controller checks this
		        // variable to validate the caller.
		        stream._writableStreamController = undefined;
		        // This queue is placed here instead of the writer class in order to allow for passing a writer to the next data
		        // producer without waiting for the queued writes to finish.
		        stream._writeRequests = new SimpleQueue();
		        // Write requests are removed from _writeRequests when write() is called on the underlying sink. This prevents
		        // them from being erroneously rejected on error. If a write() call is in-flight, the request is stored here.
		        stream._inFlightWriteRequest = undefined;
		        // The promise that was returned from writer.close(). Stored here because it may be fulfilled after the writer
		        // has been detached.
		        stream._closeRequest = undefined;
		        // Close request is removed from _closeRequest when close() is called on the underlying sink. This prevents it
		        // from being erroneously rejected on error. If a close() call is in-flight, the request is stored here.
		        stream._inFlightCloseRequest = undefined;
		        // The promise that was returned from writer.abort(). This may also be fulfilled after the writer has detached.
		        stream._pendingAbortRequest = undefined;
		        // The backpressure signal set by the controller.
		        stream._backpressure = false;
		    }
		    function IsWritableStream(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_writableStreamController')) {
		            return false;
		        }
		        return x instanceof WritableStream;
		    }
		    function IsWritableStreamLocked(stream) {
		        if (stream._writer === undefined) {
		            return false;
		        }
		        return true;
		    }
		    function WritableStreamAbort(stream, reason) {
		        var _a;
		        if (stream._state === 'closed' || stream._state === 'errored') {
		            return promiseResolvedWith(undefined);
		        }
		        stream._writableStreamController._abortReason = reason;
		        (_a = stream._writableStreamController._abortController) === null || _a === void 0 ? void 0 : _a.abort(reason);
		        // TypeScript narrows the type of `stream._state` down to 'writable' | 'erroring',
		        // but it doesn't know that signaling abort runs author code that might have changed the state.
		        // Widen the type again by casting to WritableStreamState.
		        const state = stream._state;
		        if (state === 'closed' || state === 'errored') {
		            return promiseResolvedWith(undefined);
		        }
		        if (stream._pendingAbortRequest !== undefined) {
		            return stream._pendingAbortRequest._promise;
		        }
		        let wasAlreadyErroring = false;
		        if (state === 'erroring') {
		            wasAlreadyErroring = true;
		            // reason will not be used, so don't keep a reference to it.
		            reason = undefined;
		        }
		        const promise = newPromise((resolve, reject) => {
		            stream._pendingAbortRequest = {
		                _promise: undefined,
		                _resolve: resolve,
		                _reject: reject,
		                _reason: reason,
		                _wasAlreadyErroring: wasAlreadyErroring
		            };
		        });
		        stream._pendingAbortRequest._promise = promise;
		        if (!wasAlreadyErroring) {
		            WritableStreamStartErroring(stream, reason);
		        }
		        return promise;
		    }
		    function WritableStreamClose(stream) {
		        const state = stream._state;
		        if (state === 'closed' || state === 'errored') {
		            return promiseRejectedWith(new TypeError(`The stream (in ${state} state) is not in the writable state and cannot be closed`));
		        }
		        const promise = newPromise((resolve, reject) => {
		            const closeRequest = {
		                _resolve: resolve,
		                _reject: reject
		            };
		            stream._closeRequest = closeRequest;
		        });
		        const writer = stream._writer;
		        if (writer !== undefined && stream._backpressure && state === 'writable') {
		            defaultWriterReadyPromiseResolve(writer);
		        }
		        WritableStreamDefaultControllerClose(stream._writableStreamController);
		        return promise;
		    }
		    // WritableStream API exposed for controllers.
		    function WritableStreamAddWriteRequest(stream) {
		        const promise = newPromise((resolve, reject) => {
		            const writeRequest = {
		                _resolve: resolve,
		                _reject: reject
		            };
		            stream._writeRequests.push(writeRequest);
		        });
		        return promise;
		    }
		    function WritableStreamDealWithRejection(stream, error) {
		        const state = stream._state;
		        if (state === 'writable') {
		            WritableStreamStartErroring(stream, error);
		            return;
		        }
		        WritableStreamFinishErroring(stream);
		    }
		    function WritableStreamStartErroring(stream, reason) {
		        const controller = stream._writableStreamController;
		        stream._state = 'erroring';
		        stream._storedError = reason;
		        const writer = stream._writer;
		        if (writer !== undefined) {
		            WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, reason);
		        }
		        if (!WritableStreamHasOperationMarkedInFlight(stream) && controller._started) {
		            WritableStreamFinishErroring(stream);
		        }
		    }
		    function WritableStreamFinishErroring(stream) {
		        stream._state = 'errored';
		        stream._writableStreamController[ErrorSteps]();
		        const storedError = stream._storedError;
		        stream._writeRequests.forEach(writeRequest => {
		            writeRequest._reject(storedError);
		        });
		        stream._writeRequests = new SimpleQueue();
		        if (stream._pendingAbortRequest === undefined) {
		            WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
		            return;
		        }
		        const abortRequest = stream._pendingAbortRequest;
		        stream._pendingAbortRequest = undefined;
		        if (abortRequest._wasAlreadyErroring) {
		            abortRequest._reject(storedError);
		            WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
		            return;
		        }
		        const promise = stream._writableStreamController[AbortSteps](abortRequest._reason);
		        uponPromise(promise, () => {
		            abortRequest._resolve();
		            WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
		            return null;
		        }, (reason) => {
		            abortRequest._reject(reason);
		            WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
		            return null;
		        });
		    }
		    function WritableStreamFinishInFlightWrite(stream) {
		        stream._inFlightWriteRequest._resolve(undefined);
		        stream._inFlightWriteRequest = undefined;
		    }
		    function WritableStreamFinishInFlightWriteWithError(stream, error) {
		        stream._inFlightWriteRequest._reject(error);
		        stream._inFlightWriteRequest = undefined;
		        WritableStreamDealWithRejection(stream, error);
		    }
		    function WritableStreamFinishInFlightClose(stream) {
		        stream._inFlightCloseRequest._resolve(undefined);
		        stream._inFlightCloseRequest = undefined;
		        const state = stream._state;
		        if (state === 'erroring') {
		            // The error was too late to do anything, so it is ignored.
		            stream._storedError = undefined;
		            if (stream._pendingAbortRequest !== undefined) {
		                stream._pendingAbortRequest._resolve();
		                stream._pendingAbortRequest = undefined;
		            }
		        }
		        stream._state = 'closed';
		        const writer = stream._writer;
		        if (writer !== undefined) {
		            defaultWriterClosedPromiseResolve(writer);
		        }
		    }
		    function WritableStreamFinishInFlightCloseWithError(stream, error) {
		        stream._inFlightCloseRequest._reject(error);
		        stream._inFlightCloseRequest = undefined;
		        // Never execute sink abort() after sink close().
		        if (stream._pendingAbortRequest !== undefined) {
		            stream._pendingAbortRequest._reject(error);
		            stream._pendingAbortRequest = undefined;
		        }
		        WritableStreamDealWithRejection(stream, error);
		    }
		    // TODO(ricea): Fix alphabetical order.
		    function WritableStreamCloseQueuedOrInFlight(stream) {
		        if (stream._closeRequest === undefined && stream._inFlightCloseRequest === undefined) {
		            return false;
		        }
		        return true;
		    }
		    function WritableStreamHasOperationMarkedInFlight(stream) {
		        if (stream._inFlightWriteRequest === undefined && stream._inFlightCloseRequest === undefined) {
		            return false;
		        }
		        return true;
		    }
		    function WritableStreamMarkCloseRequestInFlight(stream) {
		        stream._inFlightCloseRequest = stream._closeRequest;
		        stream._closeRequest = undefined;
		    }
		    function WritableStreamMarkFirstWriteRequestInFlight(stream) {
		        stream._inFlightWriteRequest = stream._writeRequests.shift();
		    }
		    function WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream) {
		        if (stream._closeRequest !== undefined) {
		            stream._closeRequest._reject(stream._storedError);
		            stream._closeRequest = undefined;
		        }
		        const writer = stream._writer;
		        if (writer !== undefined) {
		            defaultWriterClosedPromiseReject(writer, stream._storedError);
		        }
		    }
		    function WritableStreamUpdateBackpressure(stream, backpressure) {
		        const writer = stream._writer;
		        if (writer !== undefined && backpressure !== stream._backpressure) {
		            if (backpressure) {
		                defaultWriterReadyPromiseReset(writer);
		            }
		            else {
		                defaultWriterReadyPromiseResolve(writer);
		            }
		        }
		        stream._backpressure = backpressure;
		    }
		    /**
		     * A default writer vended by a {@link WritableStream}.
		     *
		     * @public
		     */
		    class WritableStreamDefaultWriter {
		        constructor(stream) {
		            assertRequiredArgument(stream, 1, 'WritableStreamDefaultWriter');
		            assertWritableStream(stream, 'First parameter');
		            if (IsWritableStreamLocked(stream)) {
		                throw new TypeError('This stream has already been locked for exclusive writing by another writer');
		            }
		            this._ownerWritableStream = stream;
		            stream._writer = this;
		            const state = stream._state;
		            if (state === 'writable') {
		                if (!WritableStreamCloseQueuedOrInFlight(stream) && stream._backpressure) {
		                    defaultWriterReadyPromiseInitialize(this);
		                }
		                else {
		                    defaultWriterReadyPromiseInitializeAsResolved(this);
		                }
		                defaultWriterClosedPromiseInitialize(this);
		            }
		            else if (state === 'erroring') {
		                defaultWriterReadyPromiseInitializeAsRejected(this, stream._storedError);
		                defaultWriterClosedPromiseInitialize(this);
		            }
		            else if (state === 'closed') {
		                defaultWriterReadyPromiseInitializeAsResolved(this);
		                defaultWriterClosedPromiseInitializeAsResolved(this);
		            }
		            else {
		                const storedError = stream._storedError;
		                defaultWriterReadyPromiseInitializeAsRejected(this, storedError);
		                defaultWriterClosedPromiseInitializeAsRejected(this, storedError);
		            }
		        }
		        /**
		         * Returns a promise that will be fulfilled when the stream becomes closed, or rejected if the stream ever errors or
		         * the writer’s lock is released before the stream finishes closing.
		         */
		        get closed() {
		            if (!IsWritableStreamDefaultWriter(this)) {
		                return promiseRejectedWith(defaultWriterBrandCheckException('closed'));
		            }
		            return this._closedPromise;
		        }
		        /**
		         * Returns the desired size to fill the stream’s internal queue. It can be negative, if the queue is over-full.
		         * A producer can use this information to determine the right amount of data to write.
		         *
		         * It will be `null` if the stream cannot be successfully written to (due to either being errored, or having an abort
		         * queued up). It will return zero if the stream is closed. And the getter will throw an exception if invoked when
		         * the writer’s lock is released.
		         */
		        get desiredSize() {
		            if (!IsWritableStreamDefaultWriter(this)) {
		                throw defaultWriterBrandCheckException('desiredSize');
		            }
		            if (this._ownerWritableStream === undefined) {
		                throw defaultWriterLockException('desiredSize');
		            }
		            return WritableStreamDefaultWriterGetDesiredSize(this);
		        }
		        /**
		         * Returns a promise that will be fulfilled when the desired size to fill the stream’s internal queue transitions
		         * from non-positive to positive, signaling that it is no longer applying backpressure. Once the desired size dips
		         * back to zero or below, the getter will return a new promise that stays pending until the next transition.
		         *
		         * If the stream becomes errored or aborted, or the writer’s lock is released, the returned promise will become
		         * rejected.
		         */
		        get ready() {
		            if (!IsWritableStreamDefaultWriter(this)) {
		                return promiseRejectedWith(defaultWriterBrandCheckException('ready'));
		            }
		            return this._readyPromise;
		        }
		        /**
		         * If the reader is active, behaves the same as {@link WritableStream.abort | stream.abort(reason)}.
		         */
		        abort(reason = undefined) {
		            if (!IsWritableStreamDefaultWriter(this)) {
		                return promiseRejectedWith(defaultWriterBrandCheckException('abort'));
		            }
		            if (this._ownerWritableStream === undefined) {
		                return promiseRejectedWith(defaultWriterLockException('abort'));
		            }
		            return WritableStreamDefaultWriterAbort(this, reason);
		        }
		        /**
		         * If the reader is active, behaves the same as {@link WritableStream.close | stream.close()}.
		         */
		        close() {
		            if (!IsWritableStreamDefaultWriter(this)) {
		                return promiseRejectedWith(defaultWriterBrandCheckException('close'));
		            }
		            const stream = this._ownerWritableStream;
		            if (stream === undefined) {
		                return promiseRejectedWith(defaultWriterLockException('close'));
		            }
		            if (WritableStreamCloseQueuedOrInFlight(stream)) {
		                return promiseRejectedWith(new TypeError('Cannot close an already-closing stream'));
		            }
		            return WritableStreamDefaultWriterClose(this);
		        }
		        /**
		         * Releases the writer’s lock on the corresponding stream. After the lock is released, the writer is no longer active.
		         * If the associated stream is errored when the lock is released, the writer will appear errored in the same way from
		         * now on; otherwise, the writer will appear closed.
		         *
		         * Note that the lock can still be released even if some ongoing writes have not yet finished (i.e. even if the
		         * promises returned from previous calls to {@link WritableStreamDefaultWriter.write | write()} have not yet settled).
		         * It’s not necessary to hold the lock on the writer for the duration of the write; the lock instead simply prevents
		         * other producers from writing in an interleaved manner.
		         */
		        releaseLock() {
		            if (!IsWritableStreamDefaultWriter(this)) {
		                throw defaultWriterBrandCheckException('releaseLock');
		            }
		            const stream = this._ownerWritableStream;
		            if (stream === undefined) {
		                return;
		            }
		            WritableStreamDefaultWriterRelease(this);
		        }
		        write(chunk = undefined) {
		            if (!IsWritableStreamDefaultWriter(this)) {
		                return promiseRejectedWith(defaultWriterBrandCheckException('write'));
		            }
		            if (this._ownerWritableStream === undefined) {
		                return promiseRejectedWith(defaultWriterLockException('write to'));
		            }
		            return WritableStreamDefaultWriterWrite(this, chunk);
		        }
		    }
		    Object.defineProperties(WritableStreamDefaultWriter.prototype, {
		        abort: { enumerable: true },
		        close: { enumerable: true },
		        releaseLock: { enumerable: true },
		        write: { enumerable: true },
		        closed: { enumerable: true },
		        desiredSize: { enumerable: true },
		        ready: { enumerable: true }
		    });
		    setFunctionName(WritableStreamDefaultWriter.prototype.abort, 'abort');
		    setFunctionName(WritableStreamDefaultWriter.prototype.close, 'close');
		    setFunctionName(WritableStreamDefaultWriter.prototype.releaseLock, 'releaseLock');
		    setFunctionName(WritableStreamDefaultWriter.prototype.write, 'write');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(WritableStreamDefaultWriter.prototype, Symbol.toStringTag, {
		            value: 'WritableStreamDefaultWriter',
		            configurable: true
		        });
		    }
		    // Abstract operations for the WritableStreamDefaultWriter.
		    function IsWritableStreamDefaultWriter(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_ownerWritableStream')) {
		            return false;
		        }
		        return x instanceof WritableStreamDefaultWriter;
		    }
		    // A client of WritableStreamDefaultWriter may use these functions directly to bypass state check.
		    function WritableStreamDefaultWriterAbort(writer, reason) {
		        const stream = writer._ownerWritableStream;
		        return WritableStreamAbort(stream, reason);
		    }
		    function WritableStreamDefaultWriterClose(writer) {
		        const stream = writer._ownerWritableStream;
		        return WritableStreamClose(stream);
		    }
		    function WritableStreamDefaultWriterCloseWithErrorPropagation(writer) {
		        const stream = writer._ownerWritableStream;
		        const state = stream._state;
		        if (WritableStreamCloseQueuedOrInFlight(stream) || state === 'closed') {
		            return promiseResolvedWith(undefined);
		        }
		        if (state === 'errored') {
		            return promiseRejectedWith(stream._storedError);
		        }
		        return WritableStreamDefaultWriterClose(writer);
		    }
		    function WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, error) {
		        if (writer._closedPromiseState === 'pending') {
		            defaultWriterClosedPromiseReject(writer, error);
		        }
		        else {
		            defaultWriterClosedPromiseResetToRejected(writer, error);
		        }
		    }
		    function WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, error) {
		        if (writer._readyPromiseState === 'pending') {
		            defaultWriterReadyPromiseReject(writer, error);
		        }
		        else {
		            defaultWriterReadyPromiseResetToRejected(writer, error);
		        }
		    }
		    function WritableStreamDefaultWriterGetDesiredSize(writer) {
		        const stream = writer._ownerWritableStream;
		        const state = stream._state;
		        if (state === 'errored' || state === 'erroring') {
		            return null;
		        }
		        if (state === 'closed') {
		            return 0;
		        }
		        return WritableStreamDefaultControllerGetDesiredSize(stream._writableStreamController);
		    }
		    function WritableStreamDefaultWriterRelease(writer) {
		        const stream = writer._ownerWritableStream;
		        const releasedError = new TypeError(`Writer was released and can no longer be used to monitor the stream's closedness`);
		        WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, releasedError);
		        // The state transitions to "errored" before the sink abort() method runs, but the writer.closed promise is not
		        // rejected until afterwards. This means that simply testing state will not work.
		        WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, releasedError);
		        stream._writer = undefined;
		        writer._ownerWritableStream = undefined;
		    }
		    function WritableStreamDefaultWriterWrite(writer, chunk) {
		        const stream = writer._ownerWritableStream;
		        const controller = stream._writableStreamController;
		        const chunkSize = WritableStreamDefaultControllerGetChunkSize(controller, chunk);
		        if (stream !== writer._ownerWritableStream) {
		            return promiseRejectedWith(defaultWriterLockException('write to'));
		        }
		        const state = stream._state;
		        if (state === 'errored') {
		            return promiseRejectedWith(stream._storedError);
		        }
		        if (WritableStreamCloseQueuedOrInFlight(stream) || state === 'closed') {
		            return promiseRejectedWith(new TypeError('The stream is closing or closed and cannot be written to'));
		        }
		        if (state === 'erroring') {
		            return promiseRejectedWith(stream._storedError);
		        }
		        const promise = WritableStreamAddWriteRequest(stream);
		        WritableStreamDefaultControllerWrite(controller, chunk, chunkSize);
		        return promise;
		    }
		    const closeSentinel = {};
		    /**
		     * Allows control of a {@link WritableStream | writable stream}'s state and internal queue.
		     *
		     * @public
		     */
		    class WritableStreamDefaultController {
		        constructor() {
		            throw new TypeError('Illegal constructor');
		        }
		        /**
		         * The reason which was passed to `WritableStream.abort(reason)` when the stream was aborted.
		         *
		         * @deprecated
		         *  This property has been removed from the specification, see https://github.com/whatwg/streams/pull/1177.
		         *  Use {@link WritableStreamDefaultController.signal}'s `reason` instead.
		         */
		        get abortReason() {
		            if (!IsWritableStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException$2('abortReason');
		            }
		            return this._abortReason;
		        }
		        /**
		         * An `AbortSignal` that can be used to abort the pending write or close operation when the stream is aborted.
		         */
		        get signal() {
		            if (!IsWritableStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException$2('signal');
		            }
		            if (this._abortController === undefined) {
		                // Older browsers or older Node versions may not support `AbortController` or `AbortSignal`.
		                // We don't want to bundle and ship an `AbortController` polyfill together with our polyfill,
		                // so instead we only implement support for `signal` if we find a global `AbortController` constructor.
		                throw new TypeError('WritableStreamDefaultController.prototype.signal is not supported');
		            }
		            return this._abortController.signal;
		        }
		        /**
		         * Closes the controlled writable stream, making all future interactions with it fail with the given error `e`.
		         *
		         * This method is rarely used, since usually it suffices to return a rejected promise from one of the underlying
		         * sink's methods. However, it can be useful for suddenly shutting down a stream in response to an event outside the
		         * normal lifecycle of interactions with the underlying sink.
		         */
		        error(e = undefined) {
		            if (!IsWritableStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException$2('error');
		            }
		            const state = this._controlledWritableStream._state;
		            if (state !== 'writable') {
		                // The stream is closed, errored or will be soon. The sink can't do anything useful if it gets an error here, so
		                // just treat it as a no-op.
		                return;
		            }
		            WritableStreamDefaultControllerError(this, e);
		        }
		        /** @internal */
		        [AbortSteps](reason) {
		            const result = this._abortAlgorithm(reason);
		            WritableStreamDefaultControllerClearAlgorithms(this);
		            return result;
		        }
		        /** @internal */
		        [ErrorSteps]() {
		            ResetQueue(this);
		        }
		    }
		    Object.defineProperties(WritableStreamDefaultController.prototype, {
		        abortReason: { enumerable: true },
		        signal: { enumerable: true },
		        error: { enumerable: true }
		    });
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(WritableStreamDefaultController.prototype, Symbol.toStringTag, {
		            value: 'WritableStreamDefaultController',
		            configurable: true
		        });
		    }
		    // Abstract operations implementing interface required by the WritableStream.
		    function IsWritableStreamDefaultController(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_controlledWritableStream')) {
		            return false;
		        }
		        return x instanceof WritableStreamDefaultController;
		    }
		    function SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark, sizeAlgorithm) {
		        controller._controlledWritableStream = stream;
		        stream._writableStreamController = controller;
		        // Need to set the slots so that the assert doesn't fire. In the spec the slots already exist implicitly.
		        controller._queue = undefined;
		        controller._queueTotalSize = undefined;
		        ResetQueue(controller);
		        controller._abortReason = undefined;
		        controller._abortController = createAbortController();
		        controller._started = false;
		        controller._strategySizeAlgorithm = sizeAlgorithm;
		        controller._strategyHWM = highWaterMark;
		        controller._writeAlgorithm = writeAlgorithm;
		        controller._closeAlgorithm = closeAlgorithm;
		        controller._abortAlgorithm = abortAlgorithm;
		        const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
		        WritableStreamUpdateBackpressure(stream, backpressure);
		        const startResult = startAlgorithm();
		        const startPromise = promiseResolvedWith(startResult);
		        uponPromise(startPromise, () => {
		            controller._started = true;
		            WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
		            return null;
		        }, r => {
		            controller._started = true;
		            WritableStreamDealWithRejection(stream, r);
		            return null;
		        });
		    }
		    function SetUpWritableStreamDefaultControllerFromUnderlyingSink(stream, underlyingSink, highWaterMark, sizeAlgorithm) {
		        const controller = Object.create(WritableStreamDefaultController.prototype);
		        let startAlgorithm;
		        let writeAlgorithm;
		        let closeAlgorithm;
		        let abortAlgorithm;
		        if (underlyingSink.start !== undefined) {
		            startAlgorithm = () => underlyingSink.start(controller);
		        }
		        else {
		            startAlgorithm = () => undefined;
		        }
		        if (underlyingSink.write !== undefined) {
		            writeAlgorithm = chunk => underlyingSink.write(chunk, controller);
		        }
		        else {
		            writeAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        if (underlyingSink.close !== undefined) {
		            closeAlgorithm = () => underlyingSink.close();
		        }
		        else {
		            closeAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        if (underlyingSink.abort !== undefined) {
		            abortAlgorithm = reason => underlyingSink.abort(reason);
		        }
		        else {
		            abortAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark, sizeAlgorithm);
		    }
		    // ClearAlgorithms may be called twice. Erroring the same stream in multiple ways will often result in redundant calls.
		    function WritableStreamDefaultControllerClearAlgorithms(controller) {
		        controller._writeAlgorithm = undefined;
		        controller._closeAlgorithm = undefined;
		        controller._abortAlgorithm = undefined;
		        controller._strategySizeAlgorithm = undefined;
		    }
		    function WritableStreamDefaultControllerClose(controller) {
		        EnqueueValueWithSize(controller, closeSentinel, 0);
		        WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
		    }
		    function WritableStreamDefaultControllerGetChunkSize(controller, chunk) {
		        try {
		            return controller._strategySizeAlgorithm(chunk);
		        }
		        catch (chunkSizeE) {
		            WritableStreamDefaultControllerErrorIfNeeded(controller, chunkSizeE);
		            return 1;
		        }
		    }
		    function WritableStreamDefaultControllerGetDesiredSize(controller) {
		        return controller._strategyHWM - controller._queueTotalSize;
		    }
		    function WritableStreamDefaultControllerWrite(controller, chunk, chunkSize) {
		        try {
		            EnqueueValueWithSize(controller, chunk, chunkSize);
		        }
		        catch (enqueueE) {
		            WritableStreamDefaultControllerErrorIfNeeded(controller, enqueueE);
		            return;
		        }
		        const stream = controller._controlledWritableStream;
		        if (!WritableStreamCloseQueuedOrInFlight(stream) && stream._state === 'writable') {
		            const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
		            WritableStreamUpdateBackpressure(stream, backpressure);
		        }
		        WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
		    }
		    // Abstract operations for the WritableStreamDefaultController.
		    function WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller) {
		        const stream = controller._controlledWritableStream;
		        if (!controller._started) {
		            return;
		        }
		        if (stream._inFlightWriteRequest !== undefined) {
		            return;
		        }
		        const state = stream._state;
		        if (state === 'erroring') {
		            WritableStreamFinishErroring(stream);
		            return;
		        }
		        if (controller._queue.length === 0) {
		            return;
		        }
		        const value = PeekQueueValue(controller);
		        if (value === closeSentinel) {
		            WritableStreamDefaultControllerProcessClose(controller);
		        }
		        else {
		            WritableStreamDefaultControllerProcessWrite(controller, value);
		        }
		    }
		    function WritableStreamDefaultControllerErrorIfNeeded(controller, error) {
		        if (controller._controlledWritableStream._state === 'writable') {
		            WritableStreamDefaultControllerError(controller, error);
		        }
		    }
		    function WritableStreamDefaultControllerProcessClose(controller) {
		        const stream = controller._controlledWritableStream;
		        WritableStreamMarkCloseRequestInFlight(stream);
		        DequeueValue(controller);
		        const sinkClosePromise = controller._closeAlgorithm();
		        WritableStreamDefaultControllerClearAlgorithms(controller);
		        uponPromise(sinkClosePromise, () => {
		            WritableStreamFinishInFlightClose(stream);
		            return null;
		        }, reason => {
		            WritableStreamFinishInFlightCloseWithError(stream, reason);
		            return null;
		        });
		    }
		    function WritableStreamDefaultControllerProcessWrite(controller, chunk) {
		        const stream = controller._controlledWritableStream;
		        WritableStreamMarkFirstWriteRequestInFlight(stream);
		        const sinkWritePromise = controller._writeAlgorithm(chunk);
		        uponPromise(sinkWritePromise, () => {
		            WritableStreamFinishInFlightWrite(stream);
		            const state = stream._state;
		            DequeueValue(controller);
		            if (!WritableStreamCloseQueuedOrInFlight(stream) && state === 'writable') {
		                const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
		                WritableStreamUpdateBackpressure(stream, backpressure);
		            }
		            WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
		            return null;
		        }, reason => {
		            if (stream._state === 'writable') {
		                WritableStreamDefaultControllerClearAlgorithms(controller);
		            }
		            WritableStreamFinishInFlightWriteWithError(stream, reason);
		            return null;
		        });
		    }
		    function WritableStreamDefaultControllerGetBackpressure(controller) {
		        const desiredSize = WritableStreamDefaultControllerGetDesiredSize(controller);
		        return desiredSize <= 0;
		    }
		    // A client of WritableStreamDefaultController may use these functions directly to bypass state check.
		    function WritableStreamDefaultControllerError(controller, error) {
		        const stream = controller._controlledWritableStream;
		        WritableStreamDefaultControllerClearAlgorithms(controller);
		        WritableStreamStartErroring(stream, error);
		    }
		    // Helper functions for the WritableStream.
		    function streamBrandCheckException$2(name) {
		        return new TypeError(`WritableStream.prototype.${name} can only be used on a WritableStream`);
		    }
		    // Helper functions for the WritableStreamDefaultController.
		    function defaultControllerBrandCheckException$2(name) {
		        return new TypeError(`WritableStreamDefaultController.prototype.${name} can only be used on a WritableStreamDefaultController`);
		    }
		    // Helper functions for the WritableStreamDefaultWriter.
		    function defaultWriterBrandCheckException(name) {
		        return new TypeError(`WritableStreamDefaultWriter.prototype.${name} can only be used on a WritableStreamDefaultWriter`);
		    }
		    function defaultWriterLockException(name) {
		        return new TypeError('Cannot ' + name + ' a stream using a released writer');
		    }
		    function defaultWriterClosedPromiseInitialize(writer) {
		        writer._closedPromise = newPromise((resolve, reject) => {
		            writer._closedPromise_resolve = resolve;
		            writer._closedPromise_reject = reject;
		            writer._closedPromiseState = 'pending';
		        });
		    }
		    function defaultWriterClosedPromiseInitializeAsRejected(writer, reason) {
		        defaultWriterClosedPromiseInitialize(writer);
		        defaultWriterClosedPromiseReject(writer, reason);
		    }
		    function defaultWriterClosedPromiseInitializeAsResolved(writer) {
		        defaultWriterClosedPromiseInitialize(writer);
		        defaultWriterClosedPromiseResolve(writer);
		    }
		    function defaultWriterClosedPromiseReject(writer, reason) {
		        if (writer._closedPromise_reject === undefined) {
		            return;
		        }
		        setPromiseIsHandledToTrue(writer._closedPromise);
		        writer._closedPromise_reject(reason);
		        writer._closedPromise_resolve = undefined;
		        writer._closedPromise_reject = undefined;
		        writer._closedPromiseState = 'rejected';
		    }
		    function defaultWriterClosedPromiseResetToRejected(writer, reason) {
		        defaultWriterClosedPromiseInitializeAsRejected(writer, reason);
		    }
		    function defaultWriterClosedPromiseResolve(writer) {
		        if (writer._closedPromise_resolve === undefined) {
		            return;
		        }
		        writer._closedPromise_resolve(undefined);
		        writer._closedPromise_resolve = undefined;
		        writer._closedPromise_reject = undefined;
		        writer._closedPromiseState = 'resolved';
		    }
		    function defaultWriterReadyPromiseInitialize(writer) {
		        writer._readyPromise = newPromise((resolve, reject) => {
		            writer._readyPromise_resolve = resolve;
		            writer._readyPromise_reject = reject;
		        });
		        writer._readyPromiseState = 'pending';
		    }
		    function defaultWriterReadyPromiseInitializeAsRejected(writer, reason) {
		        defaultWriterReadyPromiseInitialize(writer);
		        defaultWriterReadyPromiseReject(writer, reason);
		    }
		    function defaultWriterReadyPromiseInitializeAsResolved(writer) {
		        defaultWriterReadyPromiseInitialize(writer);
		        defaultWriterReadyPromiseResolve(writer);
		    }
		    function defaultWriterReadyPromiseReject(writer, reason) {
		        if (writer._readyPromise_reject === undefined) {
		            return;
		        }
		        setPromiseIsHandledToTrue(writer._readyPromise);
		        writer._readyPromise_reject(reason);
		        writer._readyPromise_resolve = undefined;
		        writer._readyPromise_reject = undefined;
		        writer._readyPromiseState = 'rejected';
		    }
		    function defaultWriterReadyPromiseReset(writer) {
		        defaultWriterReadyPromiseInitialize(writer);
		    }
		    function defaultWriterReadyPromiseResetToRejected(writer, reason) {
		        defaultWriterReadyPromiseInitializeAsRejected(writer, reason);
		    }
		    function defaultWriterReadyPromiseResolve(writer) {
		        if (writer._readyPromise_resolve === undefined) {
		            return;
		        }
		        writer._readyPromise_resolve(undefined);
		        writer._readyPromise_resolve = undefined;
		        writer._readyPromise_reject = undefined;
		        writer._readyPromiseState = 'fulfilled';
		    }

		    /// <reference lib="dom" />
		    function getGlobals() {
		        if (typeof globalThis !== 'undefined') {
		            return globalThis;
		        }
		        else if (typeof self !== 'undefined') {
		            return self;
		        }
		        else if (typeof commonjsGlobal !== 'undefined') {
		            return commonjsGlobal;
		        }
		        return undefined;
		    }
		    const globals = getGlobals();

		    /// <reference types="node" />
		    function isDOMExceptionConstructor(ctor) {
		        if (!(typeof ctor === 'function' || typeof ctor === 'object')) {
		            return false;
		        }
		        if (ctor.name !== 'DOMException') {
		            return false;
		        }
		        try {
		            new ctor();
		            return true;
		        }
		        catch (_a) {
		            return false;
		        }
		    }
		    /**
		     * Support:
		     * - Web browsers
		     * - Node 18 and higher (https://github.com/nodejs/node/commit/e4b1fb5e6422c1ff151234bb9de792d45dd88d87)
		     */
		    function getFromGlobal() {
		        const ctor = globals === null || globals === void 0 ? void 0 : globals.DOMException;
		        return isDOMExceptionConstructor(ctor) ? ctor : undefined;
		    }
		    /**
		     * Support:
		     * - All platforms
		     */
		    function createPolyfill() {
		        // eslint-disable-next-line @typescript-eslint/no-shadow
		        const ctor = function DOMException(message, name) {
		            this.message = message || '';
		            this.name = name || 'Error';
		            if (Error.captureStackTrace) {
		                Error.captureStackTrace(this, this.constructor);
		            }
		        };
		        setFunctionName(ctor, 'DOMException');
		        ctor.prototype = Object.create(Error.prototype);
		        Object.defineProperty(ctor.prototype, 'constructor', { value: ctor, writable: true, configurable: true });
		        return ctor;
		    }
		    // eslint-disable-next-line @typescript-eslint/no-redeclare
		    const DOMException = getFromGlobal() || createPolyfill();

		    function ReadableStreamPipeTo(source, dest, preventClose, preventAbort, preventCancel, signal) {
		        const reader = AcquireReadableStreamDefaultReader(source);
		        const writer = AcquireWritableStreamDefaultWriter(dest);
		        source._disturbed = true;
		        let shuttingDown = false;
		        // This is used to keep track of the spec's requirement that we wait for ongoing writes during shutdown.
		        let currentWrite = promiseResolvedWith(undefined);
		        return newPromise((resolve, reject) => {
		            let abortAlgorithm;
		            if (signal !== undefined) {
		                abortAlgorithm = () => {
		                    const error = signal.reason !== undefined ? signal.reason : new DOMException('Aborted', 'AbortError');
		                    const actions = [];
		                    if (!preventAbort) {
		                        actions.push(() => {
		                            if (dest._state === 'writable') {
		                                return WritableStreamAbort(dest, error);
		                            }
		                            return promiseResolvedWith(undefined);
		                        });
		                    }
		                    if (!preventCancel) {
		                        actions.push(() => {
		                            if (source._state === 'readable') {
		                                return ReadableStreamCancel(source, error);
		                            }
		                            return promiseResolvedWith(undefined);
		                        });
		                    }
		                    shutdownWithAction(() => Promise.all(actions.map(action => action())), true, error);
		                };
		                if (signal.aborted) {
		                    abortAlgorithm();
		                    return;
		                }
		                signal.addEventListener('abort', abortAlgorithm);
		            }
		            // Using reader and writer, read all chunks from this and write them to dest
		            // - Backpressure must be enforced
		            // - Shutdown must stop all activity
		            function pipeLoop() {
		                return newPromise((resolveLoop, rejectLoop) => {
		                    function next(done) {
		                        if (done) {
		                            resolveLoop();
		                        }
		                        else {
		                            // Use `PerformPromiseThen` instead of `uponPromise` to avoid
		                            // adding unnecessary `.catch(rethrowAssertionErrorRejection)` handlers
		                            PerformPromiseThen(pipeStep(), next, rejectLoop);
		                        }
		                    }
		                    next(false);
		                });
		            }
		            function pipeStep() {
		                if (shuttingDown) {
		                    return promiseResolvedWith(true);
		                }
		                return PerformPromiseThen(writer._readyPromise, () => {
		                    return newPromise((resolveRead, rejectRead) => {
		                        ReadableStreamDefaultReaderRead(reader, {
		                            _chunkSteps: chunk => {
		                                currentWrite = PerformPromiseThen(WritableStreamDefaultWriterWrite(writer, chunk), undefined, noop);
		                                resolveRead(false);
		                            },
		                            _closeSteps: () => resolveRead(true),
		                            _errorSteps: rejectRead
		                        });
		                    });
		                });
		            }
		            // Errors must be propagated forward
		            isOrBecomesErrored(source, reader._closedPromise, storedError => {
		                if (!preventAbort) {
		                    shutdownWithAction(() => WritableStreamAbort(dest, storedError), true, storedError);
		                }
		                else {
		                    shutdown(true, storedError);
		                }
		                return null;
		            });
		            // Errors must be propagated backward
		            isOrBecomesErrored(dest, writer._closedPromise, storedError => {
		                if (!preventCancel) {
		                    shutdownWithAction(() => ReadableStreamCancel(source, storedError), true, storedError);
		                }
		                else {
		                    shutdown(true, storedError);
		                }
		                return null;
		            });
		            // Closing must be propagated forward
		            isOrBecomesClosed(source, reader._closedPromise, () => {
		                if (!preventClose) {
		                    shutdownWithAction(() => WritableStreamDefaultWriterCloseWithErrorPropagation(writer));
		                }
		                else {
		                    shutdown();
		                }
		                return null;
		            });
		            // Closing must be propagated backward
		            if (WritableStreamCloseQueuedOrInFlight(dest) || dest._state === 'closed') {
		                const destClosed = new TypeError('the destination writable stream closed before all data could be piped to it');
		                if (!preventCancel) {
		                    shutdownWithAction(() => ReadableStreamCancel(source, destClosed), true, destClosed);
		                }
		                else {
		                    shutdown(true, destClosed);
		                }
		            }
		            setPromiseIsHandledToTrue(pipeLoop());
		            function waitForWritesToFinish() {
		                // Another write may have started while we were waiting on this currentWrite, so we have to be sure to wait
		                // for that too.
		                const oldCurrentWrite = currentWrite;
		                return PerformPromiseThen(currentWrite, () => oldCurrentWrite !== currentWrite ? waitForWritesToFinish() : undefined);
		            }
		            function isOrBecomesErrored(stream, promise, action) {
		                if (stream._state === 'errored') {
		                    action(stream._storedError);
		                }
		                else {
		                    uponRejection(promise, action);
		                }
		            }
		            function isOrBecomesClosed(stream, promise, action) {
		                if (stream._state === 'closed') {
		                    action();
		                }
		                else {
		                    uponFulfillment(promise, action);
		                }
		            }
		            function shutdownWithAction(action, originalIsError, originalError) {
		                if (shuttingDown) {
		                    return;
		                }
		                shuttingDown = true;
		                if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
		                    uponFulfillment(waitForWritesToFinish(), doTheRest);
		                }
		                else {
		                    doTheRest();
		                }
		                function doTheRest() {
		                    uponPromise(action(), () => finalize(originalIsError, originalError), newError => finalize(true, newError));
		                    return null;
		                }
		            }
		            function shutdown(isError, error) {
		                if (shuttingDown) {
		                    return;
		                }
		                shuttingDown = true;
		                if (dest._state === 'writable' && !WritableStreamCloseQueuedOrInFlight(dest)) {
		                    uponFulfillment(waitForWritesToFinish(), () => finalize(isError, error));
		                }
		                else {
		                    finalize(isError, error);
		                }
		            }
		            function finalize(isError, error) {
		                WritableStreamDefaultWriterRelease(writer);
		                ReadableStreamReaderGenericRelease(reader);
		                if (signal !== undefined) {
		                    signal.removeEventListener('abort', abortAlgorithm);
		                }
		                if (isError) {
		                    reject(error);
		                }
		                else {
		                    resolve(undefined);
		                }
		                return null;
		            }
		        });
		    }

		    /**
		     * Allows control of a {@link ReadableStream | readable stream}'s state and internal queue.
		     *
		     * @public
		     */
		    class ReadableStreamDefaultController {
		        constructor() {
		            throw new TypeError('Illegal constructor');
		        }
		        /**
		         * Returns the desired size to fill the controlled stream's internal queue. It can be negative, if the queue is
		         * over-full. An underlying source ought to use this information to determine when and how to apply backpressure.
		         */
		        get desiredSize() {
		            if (!IsReadableStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException$1('desiredSize');
		            }
		            return ReadableStreamDefaultControllerGetDesiredSize(this);
		        }
		        /**
		         * Closes the controlled readable stream. Consumers will still be able to read any previously-enqueued chunks from
		         * the stream, but once those are read, the stream will become closed.
		         */
		        close() {
		            if (!IsReadableStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException$1('close');
		            }
		            if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
		                throw new TypeError('The stream is not in a state that permits close');
		            }
		            ReadableStreamDefaultControllerClose(this);
		        }
		        enqueue(chunk = undefined) {
		            if (!IsReadableStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException$1('enqueue');
		            }
		            if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
		                throw new TypeError('The stream is not in a state that permits enqueue');
		            }
		            return ReadableStreamDefaultControllerEnqueue(this, chunk);
		        }
		        /**
		         * Errors the controlled readable stream, making all future interactions with it fail with the given error `e`.
		         */
		        error(e = undefined) {
		            if (!IsReadableStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException$1('error');
		            }
		            ReadableStreamDefaultControllerError(this, e);
		        }
		        /** @internal */
		        [CancelSteps](reason) {
		            ResetQueue(this);
		            const result = this._cancelAlgorithm(reason);
		            ReadableStreamDefaultControllerClearAlgorithms(this);
		            return result;
		        }
		        /** @internal */
		        [PullSteps](readRequest) {
		            const stream = this._controlledReadableStream;
		            if (this._queue.length > 0) {
		                const chunk = DequeueValue(this);
		                if (this._closeRequested && this._queue.length === 0) {
		                    ReadableStreamDefaultControllerClearAlgorithms(this);
		                    ReadableStreamClose(stream);
		                }
		                else {
		                    ReadableStreamDefaultControllerCallPullIfNeeded(this);
		                }
		                readRequest._chunkSteps(chunk);
		            }
		            else {
		                ReadableStreamAddReadRequest(stream, readRequest);
		                ReadableStreamDefaultControllerCallPullIfNeeded(this);
		            }
		        }
		        /** @internal */
		        [ReleaseSteps]() {
		            // Do nothing.
		        }
		    }
		    Object.defineProperties(ReadableStreamDefaultController.prototype, {
		        close: { enumerable: true },
		        enqueue: { enumerable: true },
		        error: { enumerable: true },
		        desiredSize: { enumerable: true }
		    });
		    setFunctionName(ReadableStreamDefaultController.prototype.close, 'close');
		    setFunctionName(ReadableStreamDefaultController.prototype.enqueue, 'enqueue');
		    setFunctionName(ReadableStreamDefaultController.prototype.error, 'error');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(ReadableStreamDefaultController.prototype, Symbol.toStringTag, {
		            value: 'ReadableStreamDefaultController',
		            configurable: true
		        });
		    }
		    // Abstract operations for the ReadableStreamDefaultController.
		    function IsReadableStreamDefaultController(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_controlledReadableStream')) {
		            return false;
		        }
		        return x instanceof ReadableStreamDefaultController;
		    }
		    function ReadableStreamDefaultControllerCallPullIfNeeded(controller) {
		        const shouldPull = ReadableStreamDefaultControllerShouldCallPull(controller);
		        if (!shouldPull) {
		            return;
		        }
		        if (controller._pulling) {
		            controller._pullAgain = true;
		            return;
		        }
		        controller._pulling = true;
		        const pullPromise = controller._pullAlgorithm();
		        uponPromise(pullPromise, () => {
		            controller._pulling = false;
		            if (controller._pullAgain) {
		                controller._pullAgain = false;
		                ReadableStreamDefaultControllerCallPullIfNeeded(controller);
		            }
		            return null;
		        }, e => {
		            ReadableStreamDefaultControllerError(controller, e);
		            return null;
		        });
		    }
		    function ReadableStreamDefaultControllerShouldCallPull(controller) {
		        const stream = controller._controlledReadableStream;
		        if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
		            return false;
		        }
		        if (!controller._started) {
		            return false;
		        }
		        if (IsReadableStreamLocked(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
		            return true;
		        }
		        const desiredSize = ReadableStreamDefaultControllerGetDesiredSize(controller);
		        if (desiredSize > 0) {
		            return true;
		        }
		        return false;
		    }
		    function ReadableStreamDefaultControllerClearAlgorithms(controller) {
		        controller._pullAlgorithm = undefined;
		        controller._cancelAlgorithm = undefined;
		        controller._strategySizeAlgorithm = undefined;
		    }
		    // A client of ReadableStreamDefaultController may use these functions directly to bypass state check.
		    function ReadableStreamDefaultControllerClose(controller) {
		        if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
		            return;
		        }
		        const stream = controller._controlledReadableStream;
		        controller._closeRequested = true;
		        if (controller._queue.length === 0) {
		            ReadableStreamDefaultControllerClearAlgorithms(controller);
		            ReadableStreamClose(stream);
		        }
		    }
		    function ReadableStreamDefaultControllerEnqueue(controller, chunk) {
		        if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
		            return;
		        }
		        const stream = controller._controlledReadableStream;
		        if (IsReadableStreamLocked(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
		            ReadableStreamFulfillReadRequest(stream, chunk, false);
		        }
		        else {
		            let chunkSize;
		            try {
		                chunkSize = controller._strategySizeAlgorithm(chunk);
		            }
		            catch (chunkSizeE) {
		                ReadableStreamDefaultControllerError(controller, chunkSizeE);
		                throw chunkSizeE;
		            }
		            try {
		                EnqueueValueWithSize(controller, chunk, chunkSize);
		            }
		            catch (enqueueE) {
		                ReadableStreamDefaultControllerError(controller, enqueueE);
		                throw enqueueE;
		            }
		        }
		        ReadableStreamDefaultControllerCallPullIfNeeded(controller);
		    }
		    function ReadableStreamDefaultControllerError(controller, e) {
		        const stream = controller._controlledReadableStream;
		        if (stream._state !== 'readable') {
		            return;
		        }
		        ResetQueue(controller);
		        ReadableStreamDefaultControllerClearAlgorithms(controller);
		        ReadableStreamError(stream, e);
		    }
		    function ReadableStreamDefaultControllerGetDesiredSize(controller) {
		        const state = controller._controlledReadableStream._state;
		        if (state === 'errored') {
		            return null;
		        }
		        if (state === 'closed') {
		            return 0;
		        }
		        return controller._strategyHWM - controller._queueTotalSize;
		    }
		    // This is used in the implementation of TransformStream.
		    function ReadableStreamDefaultControllerHasBackpressure(controller) {
		        if (ReadableStreamDefaultControllerShouldCallPull(controller)) {
		            return false;
		        }
		        return true;
		    }
		    function ReadableStreamDefaultControllerCanCloseOrEnqueue(controller) {
		        const state = controller._controlledReadableStream._state;
		        if (!controller._closeRequested && state === 'readable') {
		            return true;
		        }
		        return false;
		    }
		    function SetUpReadableStreamDefaultController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm) {
		        controller._controlledReadableStream = stream;
		        controller._queue = undefined;
		        controller._queueTotalSize = undefined;
		        ResetQueue(controller);
		        controller._started = false;
		        controller._closeRequested = false;
		        controller._pullAgain = false;
		        controller._pulling = false;
		        controller._strategySizeAlgorithm = sizeAlgorithm;
		        controller._strategyHWM = highWaterMark;
		        controller._pullAlgorithm = pullAlgorithm;
		        controller._cancelAlgorithm = cancelAlgorithm;
		        stream._readableStreamController = controller;
		        const startResult = startAlgorithm();
		        uponPromise(promiseResolvedWith(startResult), () => {
		            controller._started = true;
		            ReadableStreamDefaultControllerCallPullIfNeeded(controller);
		            return null;
		        }, r => {
		            ReadableStreamDefaultControllerError(controller, r);
		            return null;
		        });
		    }
		    function SetUpReadableStreamDefaultControllerFromUnderlyingSource(stream, underlyingSource, highWaterMark, sizeAlgorithm) {
		        const controller = Object.create(ReadableStreamDefaultController.prototype);
		        let startAlgorithm;
		        let pullAlgorithm;
		        let cancelAlgorithm;
		        if (underlyingSource.start !== undefined) {
		            startAlgorithm = () => underlyingSource.start(controller);
		        }
		        else {
		            startAlgorithm = () => undefined;
		        }
		        if (underlyingSource.pull !== undefined) {
		            pullAlgorithm = () => underlyingSource.pull(controller);
		        }
		        else {
		            pullAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        if (underlyingSource.cancel !== undefined) {
		            cancelAlgorithm = reason => underlyingSource.cancel(reason);
		        }
		        else {
		            cancelAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        SetUpReadableStreamDefaultController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm);
		    }
		    // Helper functions for the ReadableStreamDefaultController.
		    function defaultControllerBrandCheckException$1(name) {
		        return new TypeError(`ReadableStreamDefaultController.prototype.${name} can only be used on a ReadableStreamDefaultController`);
		    }

		    function ReadableStreamTee(stream, cloneForBranch2) {
		        if (IsReadableByteStreamController(stream._readableStreamController)) {
		            return ReadableByteStreamTee(stream);
		        }
		        return ReadableStreamDefaultTee(stream);
		    }
		    function ReadableStreamDefaultTee(stream, cloneForBranch2) {
		        const reader = AcquireReadableStreamDefaultReader(stream);
		        let reading = false;
		        let readAgain = false;
		        let canceled1 = false;
		        let canceled2 = false;
		        let reason1;
		        let reason2;
		        let branch1;
		        let branch2;
		        let resolveCancelPromise;
		        const cancelPromise = newPromise(resolve => {
		            resolveCancelPromise = resolve;
		        });
		        function pullAlgorithm() {
		            if (reading) {
		                readAgain = true;
		                return promiseResolvedWith(undefined);
		            }
		            reading = true;
		            const readRequest = {
		                _chunkSteps: chunk => {
		                    // This needs to be delayed a microtask because it takes at least a microtask to detect errors (using
		                    // reader._closedPromise below), and we want errors in stream to error both branches immediately. We cannot let
		                    // successful synchronously-available reads get ahead of asynchronously-available errors.
		                    _queueMicrotask(() => {
		                        readAgain = false;
		                        const chunk1 = chunk;
		                        const chunk2 = chunk;
		                        // There is no way to access the cloning code right now in the reference implementation.
		                        // If we add one then we'll need an implementation for serializable objects.
		                        // if (!canceled2 && cloneForBranch2) {
		                        //   chunk2 = StructuredDeserialize(StructuredSerialize(chunk2));
		                        // }
		                        if (!canceled1) {
		                            ReadableStreamDefaultControllerEnqueue(branch1._readableStreamController, chunk1);
		                        }
		                        if (!canceled2) {
		                            ReadableStreamDefaultControllerEnqueue(branch2._readableStreamController, chunk2);
		                        }
		                        reading = false;
		                        if (readAgain) {
		                            pullAlgorithm();
		                        }
		                    });
		                },
		                _closeSteps: () => {
		                    reading = false;
		                    if (!canceled1) {
		                        ReadableStreamDefaultControllerClose(branch1._readableStreamController);
		                    }
		                    if (!canceled2) {
		                        ReadableStreamDefaultControllerClose(branch2._readableStreamController);
		                    }
		                    if (!canceled1 || !canceled2) {
		                        resolveCancelPromise(undefined);
		                    }
		                },
		                _errorSteps: () => {
		                    reading = false;
		                }
		            };
		            ReadableStreamDefaultReaderRead(reader, readRequest);
		            return promiseResolvedWith(undefined);
		        }
		        function cancel1Algorithm(reason) {
		            canceled1 = true;
		            reason1 = reason;
		            if (canceled2) {
		                const compositeReason = CreateArrayFromList([reason1, reason2]);
		                const cancelResult = ReadableStreamCancel(stream, compositeReason);
		                resolveCancelPromise(cancelResult);
		            }
		            return cancelPromise;
		        }
		        function cancel2Algorithm(reason) {
		            canceled2 = true;
		            reason2 = reason;
		            if (canceled1) {
		                const compositeReason = CreateArrayFromList([reason1, reason2]);
		                const cancelResult = ReadableStreamCancel(stream, compositeReason);
		                resolveCancelPromise(cancelResult);
		            }
		            return cancelPromise;
		        }
		        function startAlgorithm() {
		            // do nothing
		        }
		        branch1 = CreateReadableStream(startAlgorithm, pullAlgorithm, cancel1Algorithm);
		        branch2 = CreateReadableStream(startAlgorithm, pullAlgorithm, cancel2Algorithm);
		        uponRejection(reader._closedPromise, (r) => {
		            ReadableStreamDefaultControllerError(branch1._readableStreamController, r);
		            ReadableStreamDefaultControllerError(branch2._readableStreamController, r);
		            if (!canceled1 || !canceled2) {
		                resolveCancelPromise(undefined);
		            }
		            return null;
		        });
		        return [branch1, branch2];
		    }
		    function ReadableByteStreamTee(stream) {
		        let reader = AcquireReadableStreamDefaultReader(stream);
		        let reading = false;
		        let readAgainForBranch1 = false;
		        let readAgainForBranch2 = false;
		        let canceled1 = false;
		        let canceled2 = false;
		        let reason1;
		        let reason2;
		        let branch1;
		        let branch2;
		        let resolveCancelPromise;
		        const cancelPromise = newPromise(resolve => {
		            resolveCancelPromise = resolve;
		        });
		        function forwardReaderError(thisReader) {
		            uponRejection(thisReader._closedPromise, r => {
		                if (thisReader !== reader) {
		                    return null;
		                }
		                ReadableByteStreamControllerError(branch1._readableStreamController, r);
		                ReadableByteStreamControllerError(branch2._readableStreamController, r);
		                if (!canceled1 || !canceled2) {
		                    resolveCancelPromise(undefined);
		                }
		                return null;
		            });
		        }
		        function pullWithDefaultReader() {
		            if (IsReadableStreamBYOBReader(reader)) {
		                ReadableStreamReaderGenericRelease(reader);
		                reader = AcquireReadableStreamDefaultReader(stream);
		                forwardReaderError(reader);
		            }
		            const readRequest = {
		                _chunkSteps: chunk => {
		                    // This needs to be delayed a microtask because it takes at least a microtask to detect errors (using
		                    // reader._closedPromise below), and we want errors in stream to error both branches immediately. We cannot let
		                    // successful synchronously-available reads get ahead of asynchronously-available errors.
		                    _queueMicrotask(() => {
		                        readAgainForBranch1 = false;
		                        readAgainForBranch2 = false;
		                        const chunk1 = chunk;
		                        let chunk2 = chunk;
		                        if (!canceled1 && !canceled2) {
		                            try {
		                                chunk2 = CloneAsUint8Array(chunk);
		                            }
		                            catch (cloneE) {
		                                ReadableByteStreamControllerError(branch1._readableStreamController, cloneE);
		                                ReadableByteStreamControllerError(branch2._readableStreamController, cloneE);
		                                resolveCancelPromise(ReadableStreamCancel(stream, cloneE));
		                                return;
		                            }
		                        }
		                        if (!canceled1) {
		                            ReadableByteStreamControllerEnqueue(branch1._readableStreamController, chunk1);
		                        }
		                        if (!canceled2) {
		                            ReadableByteStreamControllerEnqueue(branch2._readableStreamController, chunk2);
		                        }
		                        reading = false;
		                        if (readAgainForBranch1) {
		                            pull1Algorithm();
		                        }
		                        else if (readAgainForBranch2) {
		                            pull2Algorithm();
		                        }
		                    });
		                },
		                _closeSteps: () => {
		                    reading = false;
		                    if (!canceled1) {
		                        ReadableByteStreamControllerClose(branch1._readableStreamController);
		                    }
		                    if (!canceled2) {
		                        ReadableByteStreamControllerClose(branch2._readableStreamController);
		                    }
		                    if (branch1._readableStreamController._pendingPullIntos.length > 0) {
		                        ReadableByteStreamControllerRespond(branch1._readableStreamController, 0);
		                    }
		                    if (branch2._readableStreamController._pendingPullIntos.length > 0) {
		                        ReadableByteStreamControllerRespond(branch2._readableStreamController, 0);
		                    }
		                    if (!canceled1 || !canceled2) {
		                        resolveCancelPromise(undefined);
		                    }
		                },
		                _errorSteps: () => {
		                    reading = false;
		                }
		            };
		            ReadableStreamDefaultReaderRead(reader, readRequest);
		        }
		        function pullWithBYOBReader(view, forBranch2) {
		            if (IsReadableStreamDefaultReader(reader)) {
		                ReadableStreamReaderGenericRelease(reader);
		                reader = AcquireReadableStreamBYOBReader(stream);
		                forwardReaderError(reader);
		            }
		            const byobBranch = forBranch2 ? branch2 : branch1;
		            const otherBranch = forBranch2 ? branch1 : branch2;
		            const readIntoRequest = {
		                _chunkSteps: chunk => {
		                    // This needs to be delayed a microtask because it takes at least a microtask to detect errors (using
		                    // reader._closedPromise below), and we want errors in stream to error both branches immediately. We cannot let
		                    // successful synchronously-available reads get ahead of asynchronously-available errors.
		                    _queueMicrotask(() => {
		                        readAgainForBranch1 = false;
		                        readAgainForBranch2 = false;
		                        const byobCanceled = forBranch2 ? canceled2 : canceled1;
		                        const otherCanceled = forBranch2 ? canceled1 : canceled2;
		                        if (!otherCanceled) {
		                            let clonedChunk;
		                            try {
		                                clonedChunk = CloneAsUint8Array(chunk);
		                            }
		                            catch (cloneE) {
		                                ReadableByteStreamControllerError(byobBranch._readableStreamController, cloneE);
		                                ReadableByteStreamControllerError(otherBranch._readableStreamController, cloneE);
		                                resolveCancelPromise(ReadableStreamCancel(stream, cloneE));
		                                return;
		                            }
		                            if (!byobCanceled) {
		                                ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
		                            }
		                            ReadableByteStreamControllerEnqueue(otherBranch._readableStreamController, clonedChunk);
		                        }
		                        else if (!byobCanceled) {
		                            ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
		                        }
		                        reading = false;
		                        if (readAgainForBranch1) {
		                            pull1Algorithm();
		                        }
		                        else if (readAgainForBranch2) {
		                            pull2Algorithm();
		                        }
		                    });
		                },
		                _closeSteps: chunk => {
		                    reading = false;
		                    const byobCanceled = forBranch2 ? canceled2 : canceled1;
		                    const otherCanceled = forBranch2 ? canceled1 : canceled2;
		                    if (!byobCanceled) {
		                        ReadableByteStreamControllerClose(byobBranch._readableStreamController);
		                    }
		                    if (!otherCanceled) {
		                        ReadableByteStreamControllerClose(otherBranch._readableStreamController);
		                    }
		                    if (chunk !== undefined) {
		                        if (!byobCanceled) {
		                            ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
		                        }
		                        if (!otherCanceled && otherBranch._readableStreamController._pendingPullIntos.length > 0) {
		                            ReadableByteStreamControllerRespond(otherBranch._readableStreamController, 0);
		                        }
		                    }
		                    if (!byobCanceled || !otherCanceled) {
		                        resolveCancelPromise(undefined);
		                    }
		                },
		                _errorSteps: () => {
		                    reading = false;
		                }
		            };
		            ReadableStreamBYOBReaderRead(reader, view, 1, readIntoRequest);
		        }
		        function pull1Algorithm() {
		            if (reading) {
		                readAgainForBranch1 = true;
		                return promiseResolvedWith(undefined);
		            }
		            reading = true;
		            const byobRequest = ReadableByteStreamControllerGetBYOBRequest(branch1._readableStreamController);
		            if (byobRequest === null) {
		                pullWithDefaultReader();
		            }
		            else {
		                pullWithBYOBReader(byobRequest._view, false);
		            }
		            return promiseResolvedWith(undefined);
		        }
		        function pull2Algorithm() {
		            if (reading) {
		                readAgainForBranch2 = true;
		                return promiseResolvedWith(undefined);
		            }
		            reading = true;
		            const byobRequest = ReadableByteStreamControllerGetBYOBRequest(branch2._readableStreamController);
		            if (byobRequest === null) {
		                pullWithDefaultReader();
		            }
		            else {
		                pullWithBYOBReader(byobRequest._view, true);
		            }
		            return promiseResolvedWith(undefined);
		        }
		        function cancel1Algorithm(reason) {
		            canceled1 = true;
		            reason1 = reason;
		            if (canceled2) {
		                const compositeReason = CreateArrayFromList([reason1, reason2]);
		                const cancelResult = ReadableStreamCancel(stream, compositeReason);
		                resolveCancelPromise(cancelResult);
		            }
		            return cancelPromise;
		        }
		        function cancel2Algorithm(reason) {
		            canceled2 = true;
		            reason2 = reason;
		            if (canceled1) {
		                const compositeReason = CreateArrayFromList([reason1, reason2]);
		                const cancelResult = ReadableStreamCancel(stream, compositeReason);
		                resolveCancelPromise(cancelResult);
		            }
		            return cancelPromise;
		        }
		        function startAlgorithm() {
		            return;
		        }
		        branch1 = CreateReadableByteStream(startAlgorithm, pull1Algorithm, cancel1Algorithm);
		        branch2 = CreateReadableByteStream(startAlgorithm, pull2Algorithm, cancel2Algorithm);
		        forwardReaderError(reader);
		        return [branch1, branch2];
		    }

		    function isReadableStreamLike(stream) {
		        return typeIsObject(stream) && typeof stream.getReader !== 'undefined';
		    }

		    function ReadableStreamFrom(source) {
		        if (isReadableStreamLike(source)) {
		            return ReadableStreamFromDefaultReader(source.getReader());
		        }
		        return ReadableStreamFromIterable(source);
		    }
		    function ReadableStreamFromIterable(asyncIterable) {
		        let stream;
		        const iteratorRecord = GetIterator(asyncIterable, 'async');
		        const startAlgorithm = noop;
		        function pullAlgorithm() {
		            let nextResult;
		            try {
		                nextResult = IteratorNext(iteratorRecord);
		            }
		            catch (e) {
		                return promiseRejectedWith(e);
		            }
		            const nextPromise = promiseResolvedWith(nextResult);
		            return transformPromiseWith(nextPromise, iterResult => {
		                if (!typeIsObject(iterResult)) {
		                    throw new TypeError('The promise returned by the iterator.next() method must fulfill with an object');
		                }
		                const done = IteratorComplete(iterResult);
		                if (done) {
		                    ReadableStreamDefaultControllerClose(stream._readableStreamController);
		                }
		                else {
		                    const value = IteratorValue(iterResult);
		                    ReadableStreamDefaultControllerEnqueue(stream._readableStreamController, value);
		                }
		            });
		        }
		        function cancelAlgorithm(reason) {
		            const iterator = iteratorRecord.iterator;
		            let returnMethod;
		            try {
		                returnMethod = GetMethod(iterator, 'return');
		            }
		            catch (e) {
		                return promiseRejectedWith(e);
		            }
		            if (returnMethod === undefined) {
		                return promiseResolvedWith(undefined);
		            }
		            let returnResult;
		            try {
		                returnResult = reflectCall(returnMethod, iterator, [reason]);
		            }
		            catch (e) {
		                return promiseRejectedWith(e);
		            }
		            const returnPromise = promiseResolvedWith(returnResult);
		            return transformPromiseWith(returnPromise, iterResult => {
		                if (!typeIsObject(iterResult)) {
		                    throw new TypeError('The promise returned by the iterator.return() method must fulfill with an object');
		                }
		                return undefined;
		            });
		        }
		        stream = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, 0);
		        return stream;
		    }
		    function ReadableStreamFromDefaultReader(reader) {
		        let stream;
		        const startAlgorithm = noop;
		        function pullAlgorithm() {
		            let readPromise;
		            try {
		                readPromise = reader.read();
		            }
		            catch (e) {
		                return promiseRejectedWith(e);
		            }
		            return transformPromiseWith(readPromise, readResult => {
		                if (!typeIsObject(readResult)) {
		                    throw new TypeError('The promise returned by the reader.read() method must fulfill with an object');
		                }
		                if (readResult.done) {
		                    ReadableStreamDefaultControllerClose(stream._readableStreamController);
		                }
		                else {
		                    const value = readResult.value;
		                    ReadableStreamDefaultControllerEnqueue(stream._readableStreamController, value);
		                }
		            });
		        }
		        function cancelAlgorithm(reason) {
		            try {
		                return promiseResolvedWith(reader.cancel(reason));
		            }
		            catch (e) {
		                return promiseRejectedWith(e);
		            }
		        }
		        stream = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, 0);
		        return stream;
		    }

		    function convertUnderlyingDefaultOrByteSource(source, context) {
		        assertDictionary(source, context);
		        const original = source;
		        const autoAllocateChunkSize = original === null || original === void 0 ? void 0 : original.autoAllocateChunkSize;
		        const cancel = original === null || original === void 0 ? void 0 : original.cancel;
		        const pull = original === null || original === void 0 ? void 0 : original.pull;
		        const start = original === null || original === void 0 ? void 0 : original.start;
		        const type = original === null || original === void 0 ? void 0 : original.type;
		        return {
		            autoAllocateChunkSize: autoAllocateChunkSize === undefined ?
		                undefined :
		                convertUnsignedLongLongWithEnforceRange(autoAllocateChunkSize, `${context} has member 'autoAllocateChunkSize' that`),
		            cancel: cancel === undefined ?
		                undefined :
		                convertUnderlyingSourceCancelCallback(cancel, original, `${context} has member 'cancel' that`),
		            pull: pull === undefined ?
		                undefined :
		                convertUnderlyingSourcePullCallback(pull, original, `${context} has member 'pull' that`),
		            start: start === undefined ?
		                undefined :
		                convertUnderlyingSourceStartCallback(start, original, `${context} has member 'start' that`),
		            type: type === undefined ? undefined : convertReadableStreamType(type, `${context} has member 'type' that`)
		        };
		    }
		    function convertUnderlyingSourceCancelCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (reason) => promiseCall(fn, original, [reason]);
		    }
		    function convertUnderlyingSourcePullCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (controller) => promiseCall(fn, original, [controller]);
		    }
		    function convertUnderlyingSourceStartCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (controller) => reflectCall(fn, original, [controller]);
		    }
		    function convertReadableStreamType(type, context) {
		        type = `${type}`;
		        if (type !== 'bytes') {
		            throw new TypeError(`${context} '${type}' is not a valid enumeration value for ReadableStreamType`);
		        }
		        return type;
		    }

		    function convertIteratorOptions(options, context) {
		        assertDictionary(options, context);
		        const preventCancel = options === null || options === void 0 ? void 0 : options.preventCancel;
		        return { preventCancel: Boolean(preventCancel) };
		    }

		    function convertPipeOptions(options, context) {
		        assertDictionary(options, context);
		        const preventAbort = options === null || options === void 0 ? void 0 : options.preventAbort;
		        const preventCancel = options === null || options === void 0 ? void 0 : options.preventCancel;
		        const preventClose = options === null || options === void 0 ? void 0 : options.preventClose;
		        const signal = options === null || options === void 0 ? void 0 : options.signal;
		        if (signal !== undefined) {
		            assertAbortSignal(signal, `${context} has member 'signal' that`);
		        }
		        return {
		            preventAbort: Boolean(preventAbort),
		            preventCancel: Boolean(preventCancel),
		            preventClose: Boolean(preventClose),
		            signal
		        };
		    }
		    function assertAbortSignal(signal, context) {
		        if (!isAbortSignal(signal)) {
		            throw new TypeError(`${context} is not an AbortSignal.`);
		        }
		    }

		    function convertReadableWritablePair(pair, context) {
		        assertDictionary(pair, context);
		        const readable = pair === null || pair === void 0 ? void 0 : pair.readable;
		        assertRequiredField(readable, 'readable', 'ReadableWritablePair');
		        assertReadableStream(readable, `${context} has member 'readable' that`);
		        const writable = pair === null || pair === void 0 ? void 0 : pair.writable;
		        assertRequiredField(writable, 'writable', 'ReadableWritablePair');
		        assertWritableStream(writable, `${context} has member 'writable' that`);
		        return { readable, writable };
		    }

		    /**
		     * A readable stream represents a source of data, from which you can read.
		     *
		     * @public
		     */
		    class ReadableStream {
		        constructor(rawUnderlyingSource = {}, rawStrategy = {}) {
		            if (rawUnderlyingSource === undefined) {
		                rawUnderlyingSource = null;
		            }
		            else {
		                assertObject(rawUnderlyingSource, 'First parameter');
		            }
		            const strategy = convertQueuingStrategy(rawStrategy, 'Second parameter');
		            const underlyingSource = convertUnderlyingDefaultOrByteSource(rawUnderlyingSource, 'First parameter');
		            InitializeReadableStream(this);
		            if (underlyingSource.type === 'bytes') {
		                if (strategy.size !== undefined) {
		                    throw new RangeError('The strategy for a byte stream cannot have a size function');
		                }
		                const highWaterMark = ExtractHighWaterMark(strategy, 0);
		                SetUpReadableByteStreamControllerFromUnderlyingSource(this, underlyingSource, highWaterMark);
		            }
		            else {
		                const sizeAlgorithm = ExtractSizeAlgorithm(strategy);
		                const highWaterMark = ExtractHighWaterMark(strategy, 1);
		                SetUpReadableStreamDefaultControllerFromUnderlyingSource(this, underlyingSource, highWaterMark, sizeAlgorithm);
		            }
		        }
		        /**
		         * Whether or not the readable stream is locked to a {@link ReadableStreamDefaultReader | reader}.
		         */
		        get locked() {
		            if (!IsReadableStream(this)) {
		                throw streamBrandCheckException$1('locked');
		            }
		            return IsReadableStreamLocked(this);
		        }
		        /**
		         * Cancels the stream, signaling a loss of interest in the stream by a consumer.
		         *
		         * The supplied `reason` argument will be given to the underlying source's {@link UnderlyingSource.cancel | cancel()}
		         * method, which might or might not use it.
		         */
		        cancel(reason = undefined) {
		            if (!IsReadableStream(this)) {
		                return promiseRejectedWith(streamBrandCheckException$1('cancel'));
		            }
		            if (IsReadableStreamLocked(this)) {
		                return promiseRejectedWith(new TypeError('Cannot cancel a stream that already has a reader'));
		            }
		            return ReadableStreamCancel(this, reason);
		        }
		        getReader(rawOptions = undefined) {
		            if (!IsReadableStream(this)) {
		                throw streamBrandCheckException$1('getReader');
		            }
		            const options = convertReaderOptions(rawOptions, 'First parameter');
		            if (options.mode === undefined) {
		                return AcquireReadableStreamDefaultReader(this);
		            }
		            return AcquireReadableStreamBYOBReader(this);
		        }
		        pipeThrough(rawTransform, rawOptions = {}) {
		            if (!IsReadableStream(this)) {
		                throw streamBrandCheckException$1('pipeThrough');
		            }
		            assertRequiredArgument(rawTransform, 1, 'pipeThrough');
		            const transform = convertReadableWritablePair(rawTransform, 'First parameter');
		            const options = convertPipeOptions(rawOptions, 'Second parameter');
		            if (IsReadableStreamLocked(this)) {
		                throw new TypeError('ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream');
		            }
		            if (IsWritableStreamLocked(transform.writable)) {
		                throw new TypeError('ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream');
		            }
		            const promise = ReadableStreamPipeTo(this, transform.writable, options.preventClose, options.preventAbort, options.preventCancel, options.signal);
		            setPromiseIsHandledToTrue(promise);
		            return transform.readable;
		        }
		        pipeTo(destination, rawOptions = {}) {
		            if (!IsReadableStream(this)) {
		                return promiseRejectedWith(streamBrandCheckException$1('pipeTo'));
		            }
		            if (destination === undefined) {
		                return promiseRejectedWith(`Parameter 1 is required in 'pipeTo'.`);
		            }
		            if (!IsWritableStream(destination)) {
		                return promiseRejectedWith(new TypeError(`ReadableStream.prototype.pipeTo's first argument must be a WritableStream`));
		            }
		            let options;
		            try {
		                options = convertPipeOptions(rawOptions, 'Second parameter');
		            }
		            catch (e) {
		                return promiseRejectedWith(e);
		            }
		            if (IsReadableStreamLocked(this)) {
		                return promiseRejectedWith(new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream'));
		            }
		            if (IsWritableStreamLocked(destination)) {
		                return promiseRejectedWith(new TypeError('ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream'));
		            }
		            return ReadableStreamPipeTo(this, destination, options.preventClose, options.preventAbort, options.preventCancel, options.signal);
		        }
		        /**
		         * Tees this readable stream, returning a two-element array containing the two resulting branches as
		         * new {@link ReadableStream} instances.
		         *
		         * Teeing a stream will lock it, preventing any other consumer from acquiring a reader.
		         * To cancel the stream, cancel both of the resulting branches; a composite cancellation reason will then be
		         * propagated to the stream's underlying source.
		         *
		         * Note that the chunks seen in each branch will be the same object. If the chunks are not immutable,
		         * this could allow interference between the two branches.
		         */
		        tee() {
		            if (!IsReadableStream(this)) {
		                throw streamBrandCheckException$1('tee');
		            }
		            const branches = ReadableStreamTee(this);
		            return CreateArrayFromList(branches);
		        }
		        values(rawOptions = undefined) {
		            if (!IsReadableStream(this)) {
		                throw streamBrandCheckException$1('values');
		            }
		            const options = convertIteratorOptions(rawOptions, 'First parameter');
		            return AcquireReadableStreamAsyncIterator(this, options.preventCancel);
		        }
		        [SymbolAsyncIterator](options) {
		            // Stub implementation, overridden below
		            return this.values(options);
		        }
		        /**
		         * Creates a new ReadableStream wrapping the provided iterable or async iterable.
		         *
		         * This can be used to adapt various kinds of objects into a readable stream,
		         * such as an array, an async generator, or a Node.js readable stream.
		         */
		        static from(asyncIterable) {
		            return ReadableStreamFrom(asyncIterable);
		        }
		    }
		    Object.defineProperties(ReadableStream, {
		        from: { enumerable: true }
		    });
		    Object.defineProperties(ReadableStream.prototype, {
		        cancel: { enumerable: true },
		        getReader: { enumerable: true },
		        pipeThrough: { enumerable: true },
		        pipeTo: { enumerable: true },
		        tee: { enumerable: true },
		        values: { enumerable: true },
		        locked: { enumerable: true }
		    });
		    setFunctionName(ReadableStream.from, 'from');
		    setFunctionName(ReadableStream.prototype.cancel, 'cancel');
		    setFunctionName(ReadableStream.prototype.getReader, 'getReader');
		    setFunctionName(ReadableStream.prototype.pipeThrough, 'pipeThrough');
		    setFunctionName(ReadableStream.prototype.pipeTo, 'pipeTo');
		    setFunctionName(ReadableStream.prototype.tee, 'tee');
		    setFunctionName(ReadableStream.prototype.values, 'values');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(ReadableStream.prototype, Symbol.toStringTag, {
		            value: 'ReadableStream',
		            configurable: true
		        });
		    }
		    Object.defineProperty(ReadableStream.prototype, SymbolAsyncIterator, {
		        value: ReadableStream.prototype.values,
		        writable: true,
		        configurable: true
		    });
		    // Abstract operations for the ReadableStream.
		    // Throws if and only if startAlgorithm throws.
		    function CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark = 1, sizeAlgorithm = () => 1) {
		        const stream = Object.create(ReadableStream.prototype);
		        InitializeReadableStream(stream);
		        const controller = Object.create(ReadableStreamDefaultController.prototype);
		        SetUpReadableStreamDefaultController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm);
		        return stream;
		    }
		    // Throws if and only if startAlgorithm throws.
		    function CreateReadableByteStream(startAlgorithm, pullAlgorithm, cancelAlgorithm) {
		        const stream = Object.create(ReadableStream.prototype);
		        InitializeReadableStream(stream);
		        const controller = Object.create(ReadableByteStreamController.prototype);
		        SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, 0, undefined);
		        return stream;
		    }
		    function InitializeReadableStream(stream) {
		        stream._state = 'readable';
		        stream._reader = undefined;
		        stream._storedError = undefined;
		        stream._disturbed = false;
		    }
		    function IsReadableStream(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_readableStreamController')) {
		            return false;
		        }
		        return x instanceof ReadableStream;
		    }
		    function IsReadableStreamLocked(stream) {
		        if (stream._reader === undefined) {
		            return false;
		        }
		        return true;
		    }
		    // ReadableStream API exposed for controllers.
		    function ReadableStreamCancel(stream, reason) {
		        stream._disturbed = true;
		        if (stream._state === 'closed') {
		            return promiseResolvedWith(undefined);
		        }
		        if (stream._state === 'errored') {
		            return promiseRejectedWith(stream._storedError);
		        }
		        ReadableStreamClose(stream);
		        const reader = stream._reader;
		        if (reader !== undefined && IsReadableStreamBYOBReader(reader)) {
		            const readIntoRequests = reader._readIntoRequests;
		            reader._readIntoRequests = new SimpleQueue();
		            readIntoRequests.forEach(readIntoRequest => {
		                readIntoRequest._closeSteps(undefined);
		            });
		        }
		        const sourceCancelPromise = stream._readableStreamController[CancelSteps](reason);
		        return transformPromiseWith(sourceCancelPromise, noop);
		    }
		    function ReadableStreamClose(stream) {
		        stream._state = 'closed';
		        const reader = stream._reader;
		        if (reader === undefined) {
		            return;
		        }
		        defaultReaderClosedPromiseResolve(reader);
		        if (IsReadableStreamDefaultReader(reader)) {
		            const readRequests = reader._readRequests;
		            reader._readRequests = new SimpleQueue();
		            readRequests.forEach(readRequest => {
		                readRequest._closeSteps();
		            });
		        }
		    }
		    function ReadableStreamError(stream, e) {
		        stream._state = 'errored';
		        stream._storedError = e;
		        const reader = stream._reader;
		        if (reader === undefined) {
		            return;
		        }
		        defaultReaderClosedPromiseReject(reader, e);
		        if (IsReadableStreamDefaultReader(reader)) {
		            ReadableStreamDefaultReaderErrorReadRequests(reader, e);
		        }
		        else {
		            ReadableStreamBYOBReaderErrorReadIntoRequests(reader, e);
		        }
		    }
		    // Helper functions for the ReadableStream.
		    function streamBrandCheckException$1(name) {
		        return new TypeError(`ReadableStream.prototype.${name} can only be used on a ReadableStream`);
		    }

		    function convertQueuingStrategyInit(init, context) {
		        assertDictionary(init, context);
		        const highWaterMark = init === null || init === void 0 ? void 0 : init.highWaterMark;
		        assertRequiredField(highWaterMark, 'highWaterMark', 'QueuingStrategyInit');
		        return {
		            highWaterMark: convertUnrestrictedDouble(highWaterMark)
		        };
		    }

		    // The size function must not have a prototype property nor be a constructor
		    const byteLengthSizeFunction = (chunk) => {
		        return chunk.byteLength;
		    };
		    setFunctionName(byteLengthSizeFunction, 'size');
		    /**
		     * A queuing strategy that counts the number of bytes in each chunk.
		     *
		     * @public
		     */
		    class ByteLengthQueuingStrategy {
		        constructor(options) {
		            assertRequiredArgument(options, 1, 'ByteLengthQueuingStrategy');
		            options = convertQueuingStrategyInit(options, 'First parameter');
		            this._byteLengthQueuingStrategyHighWaterMark = options.highWaterMark;
		        }
		        /**
		         * Returns the high water mark provided to the constructor.
		         */
		        get highWaterMark() {
		            if (!IsByteLengthQueuingStrategy(this)) {
		                throw byteLengthBrandCheckException('highWaterMark');
		            }
		            return this._byteLengthQueuingStrategyHighWaterMark;
		        }
		        /**
		         * Measures the size of `chunk` by returning the value of its `byteLength` property.
		         */
		        get size() {
		            if (!IsByteLengthQueuingStrategy(this)) {
		                throw byteLengthBrandCheckException('size');
		            }
		            return byteLengthSizeFunction;
		        }
		    }
		    Object.defineProperties(ByteLengthQueuingStrategy.prototype, {
		        highWaterMark: { enumerable: true },
		        size: { enumerable: true }
		    });
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(ByteLengthQueuingStrategy.prototype, Symbol.toStringTag, {
		            value: 'ByteLengthQueuingStrategy',
		            configurable: true
		        });
		    }
		    // Helper functions for the ByteLengthQueuingStrategy.
		    function byteLengthBrandCheckException(name) {
		        return new TypeError(`ByteLengthQueuingStrategy.prototype.${name} can only be used on a ByteLengthQueuingStrategy`);
		    }
		    function IsByteLengthQueuingStrategy(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_byteLengthQueuingStrategyHighWaterMark')) {
		            return false;
		        }
		        return x instanceof ByteLengthQueuingStrategy;
		    }

		    // The size function must not have a prototype property nor be a constructor
		    const countSizeFunction = () => {
		        return 1;
		    };
		    setFunctionName(countSizeFunction, 'size');
		    /**
		     * A queuing strategy that counts the number of chunks.
		     *
		     * @public
		     */
		    class CountQueuingStrategy {
		        constructor(options) {
		            assertRequiredArgument(options, 1, 'CountQueuingStrategy');
		            options = convertQueuingStrategyInit(options, 'First parameter');
		            this._countQueuingStrategyHighWaterMark = options.highWaterMark;
		        }
		        /**
		         * Returns the high water mark provided to the constructor.
		         */
		        get highWaterMark() {
		            if (!IsCountQueuingStrategy(this)) {
		                throw countBrandCheckException('highWaterMark');
		            }
		            return this._countQueuingStrategyHighWaterMark;
		        }
		        /**
		         * Measures the size of `chunk` by always returning 1.
		         * This ensures that the total queue size is a count of the number of chunks in the queue.
		         */
		        get size() {
		            if (!IsCountQueuingStrategy(this)) {
		                throw countBrandCheckException('size');
		            }
		            return countSizeFunction;
		        }
		    }
		    Object.defineProperties(CountQueuingStrategy.prototype, {
		        highWaterMark: { enumerable: true },
		        size: { enumerable: true }
		    });
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(CountQueuingStrategy.prototype, Symbol.toStringTag, {
		            value: 'CountQueuingStrategy',
		            configurable: true
		        });
		    }
		    // Helper functions for the CountQueuingStrategy.
		    function countBrandCheckException(name) {
		        return new TypeError(`CountQueuingStrategy.prototype.${name} can only be used on a CountQueuingStrategy`);
		    }
		    function IsCountQueuingStrategy(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_countQueuingStrategyHighWaterMark')) {
		            return false;
		        }
		        return x instanceof CountQueuingStrategy;
		    }

		    function convertTransformer(original, context) {
		        assertDictionary(original, context);
		        const cancel = original === null || original === void 0 ? void 0 : original.cancel;
		        const flush = original === null || original === void 0 ? void 0 : original.flush;
		        const readableType = original === null || original === void 0 ? void 0 : original.readableType;
		        const start = original === null || original === void 0 ? void 0 : original.start;
		        const transform = original === null || original === void 0 ? void 0 : original.transform;
		        const writableType = original === null || original === void 0 ? void 0 : original.writableType;
		        return {
		            cancel: cancel === undefined ?
		                undefined :
		                convertTransformerCancelCallback(cancel, original, `${context} has member 'cancel' that`),
		            flush: flush === undefined ?
		                undefined :
		                convertTransformerFlushCallback(flush, original, `${context} has member 'flush' that`),
		            readableType,
		            start: start === undefined ?
		                undefined :
		                convertTransformerStartCallback(start, original, `${context} has member 'start' that`),
		            transform: transform === undefined ?
		                undefined :
		                convertTransformerTransformCallback(transform, original, `${context} has member 'transform' that`),
		            writableType
		        };
		    }
		    function convertTransformerFlushCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (controller) => promiseCall(fn, original, [controller]);
		    }
		    function convertTransformerStartCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (controller) => reflectCall(fn, original, [controller]);
		    }
		    function convertTransformerTransformCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (chunk, controller) => promiseCall(fn, original, [chunk, controller]);
		    }
		    function convertTransformerCancelCallback(fn, original, context) {
		        assertFunction(fn, context);
		        return (reason) => promiseCall(fn, original, [reason]);
		    }

		    // Class TransformStream
		    /**
		     * A transform stream consists of a pair of streams: a {@link WritableStream | writable stream},
		     * known as its writable side, and a {@link ReadableStream | readable stream}, known as its readable side.
		     * In a manner specific to the transform stream in question, writes to the writable side result in new data being
		     * made available for reading from the readable side.
		     *
		     * @public
		     */
		    class TransformStream {
		        constructor(rawTransformer = {}, rawWritableStrategy = {}, rawReadableStrategy = {}) {
		            if (rawTransformer === undefined) {
		                rawTransformer = null;
		            }
		            const writableStrategy = convertQueuingStrategy(rawWritableStrategy, 'Second parameter');
		            const readableStrategy = convertQueuingStrategy(rawReadableStrategy, 'Third parameter');
		            const transformer = convertTransformer(rawTransformer, 'First parameter');
		            if (transformer.readableType !== undefined) {
		                throw new RangeError('Invalid readableType specified');
		            }
		            if (transformer.writableType !== undefined) {
		                throw new RangeError('Invalid writableType specified');
		            }
		            const readableHighWaterMark = ExtractHighWaterMark(readableStrategy, 0);
		            const readableSizeAlgorithm = ExtractSizeAlgorithm(readableStrategy);
		            const writableHighWaterMark = ExtractHighWaterMark(writableStrategy, 1);
		            const writableSizeAlgorithm = ExtractSizeAlgorithm(writableStrategy);
		            let startPromise_resolve;
		            const startPromise = newPromise(resolve => {
		                startPromise_resolve = resolve;
		            });
		            InitializeTransformStream(this, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark, readableSizeAlgorithm);
		            SetUpTransformStreamDefaultControllerFromTransformer(this, transformer);
		            if (transformer.start !== undefined) {
		                startPromise_resolve(transformer.start(this._transformStreamController));
		            }
		            else {
		                startPromise_resolve(undefined);
		            }
		        }
		        /**
		         * The readable side of the transform stream.
		         */
		        get readable() {
		            if (!IsTransformStream(this)) {
		                throw streamBrandCheckException('readable');
		            }
		            return this._readable;
		        }
		        /**
		         * The writable side of the transform stream.
		         */
		        get writable() {
		            if (!IsTransformStream(this)) {
		                throw streamBrandCheckException('writable');
		            }
		            return this._writable;
		        }
		    }
		    Object.defineProperties(TransformStream.prototype, {
		        readable: { enumerable: true },
		        writable: { enumerable: true }
		    });
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(TransformStream.prototype, Symbol.toStringTag, {
		            value: 'TransformStream',
		            configurable: true
		        });
		    }
		    function InitializeTransformStream(stream, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark, readableSizeAlgorithm) {
		        function startAlgorithm() {
		            return startPromise;
		        }
		        function writeAlgorithm(chunk) {
		            return TransformStreamDefaultSinkWriteAlgorithm(stream, chunk);
		        }
		        function abortAlgorithm(reason) {
		            return TransformStreamDefaultSinkAbortAlgorithm(stream, reason);
		        }
		        function closeAlgorithm() {
		            return TransformStreamDefaultSinkCloseAlgorithm(stream);
		        }
		        stream._writable = CreateWritableStream(startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, writableHighWaterMark, writableSizeAlgorithm);
		        function pullAlgorithm() {
		            return TransformStreamDefaultSourcePullAlgorithm(stream);
		        }
		        function cancelAlgorithm(reason) {
		            return TransformStreamDefaultSourceCancelAlgorithm(stream, reason);
		        }
		        stream._readable = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, readableHighWaterMark, readableSizeAlgorithm);
		        // The [[backpressure]] slot is set to undefined so that it can be initialised by TransformStreamSetBackpressure.
		        stream._backpressure = undefined;
		        stream._backpressureChangePromise = undefined;
		        stream._backpressureChangePromise_resolve = undefined;
		        TransformStreamSetBackpressure(stream, true);
		        stream._transformStreamController = undefined;
		    }
		    function IsTransformStream(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_transformStreamController')) {
		            return false;
		        }
		        return x instanceof TransformStream;
		    }
		    // This is a no-op if both sides are already errored.
		    function TransformStreamError(stream, e) {
		        ReadableStreamDefaultControllerError(stream._readable._readableStreamController, e);
		        TransformStreamErrorWritableAndUnblockWrite(stream, e);
		    }
		    function TransformStreamErrorWritableAndUnblockWrite(stream, e) {
		        TransformStreamDefaultControllerClearAlgorithms(stream._transformStreamController);
		        WritableStreamDefaultControllerErrorIfNeeded(stream._writable._writableStreamController, e);
		        TransformStreamUnblockWrite(stream);
		    }
		    function TransformStreamUnblockWrite(stream) {
		        if (stream._backpressure) {
		            // Pretend that pull() was called to permit any pending write() calls to complete. TransformStreamSetBackpressure()
		            // cannot be called from enqueue() or pull() once the ReadableStream is errored, so this will will be the final time
		            // _backpressure is set.
		            TransformStreamSetBackpressure(stream, false);
		        }
		    }
		    function TransformStreamSetBackpressure(stream, backpressure) {
		        // Passes also when called during construction.
		        if (stream._backpressureChangePromise !== undefined) {
		            stream._backpressureChangePromise_resolve();
		        }
		        stream._backpressureChangePromise = newPromise(resolve => {
		            stream._backpressureChangePromise_resolve = resolve;
		        });
		        stream._backpressure = backpressure;
		    }
		    // Class TransformStreamDefaultController
		    /**
		     * Allows control of the {@link ReadableStream} and {@link WritableStream} of the associated {@link TransformStream}.
		     *
		     * @public
		     */
		    class TransformStreamDefaultController {
		        constructor() {
		            throw new TypeError('Illegal constructor');
		        }
		        /**
		         * Returns the desired size to fill the readable side’s internal queue. It can be negative, if the queue is over-full.
		         */
		        get desiredSize() {
		            if (!IsTransformStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException('desiredSize');
		            }
		            const readableController = this._controlledTransformStream._readable._readableStreamController;
		            return ReadableStreamDefaultControllerGetDesiredSize(readableController);
		        }
		        enqueue(chunk = undefined) {
		            if (!IsTransformStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException('enqueue');
		            }
		            TransformStreamDefaultControllerEnqueue(this, chunk);
		        }
		        /**
		         * Errors both the readable side and the writable side of the controlled transform stream, making all future
		         * interactions with it fail with the given error `e`. Any chunks queued for transformation will be discarded.
		         */
		        error(reason = undefined) {
		            if (!IsTransformStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException('error');
		            }
		            TransformStreamDefaultControllerError(this, reason);
		        }
		        /**
		         * Closes the readable side and errors the writable side of the controlled transform stream. This is useful when the
		         * transformer only needs to consume a portion of the chunks written to the writable side.
		         */
		        terminate() {
		            if (!IsTransformStreamDefaultController(this)) {
		                throw defaultControllerBrandCheckException('terminate');
		            }
		            TransformStreamDefaultControllerTerminate(this);
		        }
		    }
		    Object.defineProperties(TransformStreamDefaultController.prototype, {
		        enqueue: { enumerable: true },
		        error: { enumerable: true },
		        terminate: { enumerable: true },
		        desiredSize: { enumerable: true }
		    });
		    setFunctionName(TransformStreamDefaultController.prototype.enqueue, 'enqueue');
		    setFunctionName(TransformStreamDefaultController.prototype.error, 'error');
		    setFunctionName(TransformStreamDefaultController.prototype.terminate, 'terminate');
		    if (typeof Symbol.toStringTag === 'symbol') {
		        Object.defineProperty(TransformStreamDefaultController.prototype, Symbol.toStringTag, {
		            value: 'TransformStreamDefaultController',
		            configurable: true
		        });
		    }
		    // Transform Stream Default Controller Abstract Operations
		    function IsTransformStreamDefaultController(x) {
		        if (!typeIsObject(x)) {
		            return false;
		        }
		        if (!Object.prototype.hasOwnProperty.call(x, '_controlledTransformStream')) {
		            return false;
		        }
		        return x instanceof TransformStreamDefaultController;
		    }
		    function SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm, cancelAlgorithm) {
		        controller._controlledTransformStream = stream;
		        stream._transformStreamController = controller;
		        controller._transformAlgorithm = transformAlgorithm;
		        controller._flushAlgorithm = flushAlgorithm;
		        controller._cancelAlgorithm = cancelAlgorithm;
		        controller._finishPromise = undefined;
		        controller._finishPromise_resolve = undefined;
		        controller._finishPromise_reject = undefined;
		    }
		    function SetUpTransformStreamDefaultControllerFromTransformer(stream, transformer) {
		        const controller = Object.create(TransformStreamDefaultController.prototype);
		        let transformAlgorithm;
		        let flushAlgorithm;
		        let cancelAlgorithm;
		        if (transformer.transform !== undefined) {
		            transformAlgorithm = chunk => transformer.transform(chunk, controller);
		        }
		        else {
		            transformAlgorithm = chunk => {
		                try {
		                    TransformStreamDefaultControllerEnqueue(controller, chunk);
		                    return promiseResolvedWith(undefined);
		                }
		                catch (transformResultE) {
		                    return promiseRejectedWith(transformResultE);
		                }
		            };
		        }
		        if (transformer.flush !== undefined) {
		            flushAlgorithm = () => transformer.flush(controller);
		        }
		        else {
		            flushAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        if (transformer.cancel !== undefined) {
		            cancelAlgorithm = reason => transformer.cancel(reason);
		        }
		        else {
		            cancelAlgorithm = () => promiseResolvedWith(undefined);
		        }
		        SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm, cancelAlgorithm);
		    }
		    function TransformStreamDefaultControllerClearAlgorithms(controller) {
		        controller._transformAlgorithm = undefined;
		        controller._flushAlgorithm = undefined;
		        controller._cancelAlgorithm = undefined;
		    }
		    function TransformStreamDefaultControllerEnqueue(controller, chunk) {
		        const stream = controller._controlledTransformStream;
		        const readableController = stream._readable._readableStreamController;
		        if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController)) {
		            throw new TypeError('Readable side is not in a state that permits enqueue');
		        }
		        // We throttle transform invocations based on the backpressure of the ReadableStream, but we still
		        // accept TransformStreamDefaultControllerEnqueue() calls.
		        try {
		            ReadableStreamDefaultControllerEnqueue(readableController, chunk);
		        }
		        catch (e) {
		            // This happens when readableStrategy.size() throws.
		            TransformStreamErrorWritableAndUnblockWrite(stream, e);
		            throw stream._readable._storedError;
		        }
		        const backpressure = ReadableStreamDefaultControllerHasBackpressure(readableController);
		        if (backpressure !== stream._backpressure) {
		            TransformStreamSetBackpressure(stream, true);
		        }
		    }
		    function TransformStreamDefaultControllerError(controller, e) {
		        TransformStreamError(controller._controlledTransformStream, e);
		    }
		    function TransformStreamDefaultControllerPerformTransform(controller, chunk) {
		        const transformPromise = controller._transformAlgorithm(chunk);
		        return transformPromiseWith(transformPromise, undefined, r => {
		            TransformStreamError(controller._controlledTransformStream, r);
		            throw r;
		        });
		    }
		    function TransformStreamDefaultControllerTerminate(controller) {
		        const stream = controller._controlledTransformStream;
		        const readableController = stream._readable._readableStreamController;
		        ReadableStreamDefaultControllerClose(readableController);
		        const error = new TypeError('TransformStream terminated');
		        TransformStreamErrorWritableAndUnblockWrite(stream, error);
		    }
		    // TransformStreamDefaultSink Algorithms
		    function TransformStreamDefaultSinkWriteAlgorithm(stream, chunk) {
		        const controller = stream._transformStreamController;
		        if (stream._backpressure) {
		            const backpressureChangePromise = stream._backpressureChangePromise;
		            return transformPromiseWith(backpressureChangePromise, () => {
		                const writable = stream._writable;
		                const state = writable._state;
		                if (state === 'erroring') {
		                    throw writable._storedError;
		                }
		                return TransformStreamDefaultControllerPerformTransform(controller, chunk);
		            });
		        }
		        return TransformStreamDefaultControllerPerformTransform(controller, chunk);
		    }
		    function TransformStreamDefaultSinkAbortAlgorithm(stream, reason) {
		        const controller = stream._transformStreamController;
		        if (controller._finishPromise !== undefined) {
		            return controller._finishPromise;
		        }
		        // stream._readable cannot change after construction, so caching it across a call to user code is safe.
		        const readable = stream._readable;
		        // Assign the _finishPromise now so that if _cancelAlgorithm calls readable.cancel() internally,
		        // we don't run the _cancelAlgorithm again.
		        controller._finishPromise = newPromise((resolve, reject) => {
		            controller._finishPromise_resolve = resolve;
		            controller._finishPromise_reject = reject;
		        });
		        const cancelPromise = controller._cancelAlgorithm(reason);
		        TransformStreamDefaultControllerClearAlgorithms(controller);
		        uponPromise(cancelPromise, () => {
		            if (readable._state === 'errored') {
		                defaultControllerFinishPromiseReject(controller, readable._storedError);
		            }
		            else {
		                ReadableStreamDefaultControllerError(readable._readableStreamController, reason);
		                defaultControllerFinishPromiseResolve(controller);
		            }
		            return null;
		        }, r => {
		            ReadableStreamDefaultControllerError(readable._readableStreamController, r);
		            defaultControllerFinishPromiseReject(controller, r);
		            return null;
		        });
		        return controller._finishPromise;
		    }
		    function TransformStreamDefaultSinkCloseAlgorithm(stream) {
		        const controller = stream._transformStreamController;
		        if (controller._finishPromise !== undefined) {
		            return controller._finishPromise;
		        }
		        // stream._readable cannot change after construction, so caching it across a call to user code is safe.
		        const readable = stream._readable;
		        // Assign the _finishPromise now so that if _flushAlgorithm calls readable.cancel() internally,
		        // we don't also run the _cancelAlgorithm.
		        controller._finishPromise = newPromise((resolve, reject) => {
		            controller._finishPromise_resolve = resolve;
		            controller._finishPromise_reject = reject;
		        });
		        const flushPromise = controller._flushAlgorithm();
		        TransformStreamDefaultControllerClearAlgorithms(controller);
		        uponPromise(flushPromise, () => {
		            if (readable._state === 'errored') {
		                defaultControllerFinishPromiseReject(controller, readable._storedError);
		            }
		            else {
		                ReadableStreamDefaultControllerClose(readable._readableStreamController);
		                defaultControllerFinishPromiseResolve(controller);
		            }
		            return null;
		        }, r => {
		            ReadableStreamDefaultControllerError(readable._readableStreamController, r);
		            defaultControllerFinishPromiseReject(controller, r);
		            return null;
		        });
		        return controller._finishPromise;
		    }
		    // TransformStreamDefaultSource Algorithms
		    function TransformStreamDefaultSourcePullAlgorithm(stream) {
		        // Invariant. Enforced by the promises returned by start() and pull().
		        TransformStreamSetBackpressure(stream, false);
		        // Prevent the next pull() call until there is backpressure.
		        return stream._backpressureChangePromise;
		    }
		    function TransformStreamDefaultSourceCancelAlgorithm(stream, reason) {
		        const controller = stream._transformStreamController;
		        if (controller._finishPromise !== undefined) {
		            return controller._finishPromise;
		        }
		        // stream._writable cannot change after construction, so caching it across a call to user code is safe.
		        const writable = stream._writable;
		        // Assign the _finishPromise now so that if _flushAlgorithm calls writable.abort() or
		        // writable.cancel() internally, we don't run the _cancelAlgorithm again, or also run the
		        // _flushAlgorithm.
		        controller._finishPromise = newPromise((resolve, reject) => {
		            controller._finishPromise_resolve = resolve;
		            controller._finishPromise_reject = reject;
		        });
		        const cancelPromise = controller._cancelAlgorithm(reason);
		        TransformStreamDefaultControllerClearAlgorithms(controller);
		        uponPromise(cancelPromise, () => {
		            if (writable._state === 'errored') {
		                defaultControllerFinishPromiseReject(controller, writable._storedError);
		            }
		            else {
		                WritableStreamDefaultControllerErrorIfNeeded(writable._writableStreamController, reason);
		                TransformStreamUnblockWrite(stream);
		                defaultControllerFinishPromiseResolve(controller);
		            }
		            return null;
		        }, r => {
		            WritableStreamDefaultControllerErrorIfNeeded(writable._writableStreamController, r);
		            TransformStreamUnblockWrite(stream);
		            defaultControllerFinishPromiseReject(controller, r);
		            return null;
		        });
		        return controller._finishPromise;
		    }
		    // Helper functions for the TransformStreamDefaultController.
		    function defaultControllerBrandCheckException(name) {
		        return new TypeError(`TransformStreamDefaultController.prototype.${name} can only be used on a TransformStreamDefaultController`);
		    }
		    function defaultControllerFinishPromiseResolve(controller) {
		        if (controller._finishPromise_resolve === undefined) {
		            return;
		        }
		        controller._finishPromise_resolve();
		        controller._finishPromise_resolve = undefined;
		        controller._finishPromise_reject = undefined;
		    }
		    function defaultControllerFinishPromiseReject(controller, reason) {
		        if (controller._finishPromise_reject === undefined) {
		            return;
		        }
		        setPromiseIsHandledToTrue(controller._finishPromise);
		        controller._finishPromise_reject(reason);
		        controller._finishPromise_resolve = undefined;
		        controller._finishPromise_reject = undefined;
		    }
		    // Helper functions for the TransformStream.
		    function streamBrandCheckException(name) {
		        return new TypeError(`TransformStream.prototype.${name} can only be used on a TransformStream`);
		    }

		    exports.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
		    exports.CountQueuingStrategy = CountQueuingStrategy;
		    exports.ReadableByteStreamController = ReadableByteStreamController;
		    exports.ReadableStream = ReadableStream;
		    exports.ReadableStreamBYOBReader = ReadableStreamBYOBReader;
		    exports.ReadableStreamBYOBRequest = ReadableStreamBYOBRequest;
		    exports.ReadableStreamDefaultController = ReadableStreamDefaultController;
		    exports.ReadableStreamDefaultReader = ReadableStreamDefaultReader;
		    exports.TransformStream = TransformStream;
		    exports.TransformStreamDefaultController = TransformStreamDefaultController;
		    exports.WritableStream = WritableStream;
		    exports.WritableStreamDefaultController = WritableStreamDefaultController;
		    exports.WritableStreamDefaultWriter = WritableStreamDefaultWriter;

		}));
		
	} (ponyfill_es2018$1, ponyfill_es2018$1.exports));
	return ponyfill_es2018$1.exports;
}

/* c8 ignore start */

var hasRequiredStreams;

function requireStreams () {
	if (hasRequiredStreams) return streams;
	hasRequiredStreams = 1;
	// 64 KiB (same size chrome slice theirs blob into Uint8array's)
	const POOL_SIZE = 65536;

	if (!globalThis.ReadableStream) {
	  // `node:stream/web` got introduced in v16.5.0 as experimental
	  // and it's preferred over the polyfilled version. So we also
	  // suppress the warning that gets emitted by NodeJS for using it.
	  try {
	    const process = require('node:process');
	    const { emitWarning } = process;
	    try {
	      process.emitWarning = () => {};
	      Object.assign(globalThis, require('node:stream/web'));
	      process.emitWarning = emitWarning;
	    } catch (error) {
	      process.emitWarning = emitWarning;
	      throw error
	    }
	  } catch (error) {
	    // fallback to polyfill implementation
	    Object.assign(globalThis, requirePonyfill_es2018());
	  }
	}

	try {
	  // Don't use node: prefix for this, require+node: is not supported until node v14.14
	  // Only `import()` can use prefix in 12.20 and later
	  const { Blob } = require('buffer');
	  if (Blob && !Blob.prototype.stream) {
	    Blob.prototype.stream = function name (params) {
	      let position = 0;
	      const blob = this;

	      return new ReadableStream({
	        type: 'bytes',
	        async pull (ctrl) {
	          const chunk = blob.slice(position, Math.min(blob.size, position + POOL_SIZE));
	          const buffer = await chunk.arrayBuffer();
	          position += buffer.byteLength;
	          ctrl.enqueue(new Uint8Array(buffer));

	          if (position === blob.size) {
	            ctrl.close();
	          }
	        }
	      })
	    };
	  }
	} catch (error) {}
	/* c8 ignore end */
	return streams;
}

requireStreams();

/*! fetch-blob. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */


// 64 KiB (same size chrome slice theirs blob into Uint8array's)
const POOL_SIZE = 65536;

/** @param {(Blob | Uint8Array)[]} parts */
async function * toIterator (parts, clone = true) {
  for (const part of parts) {
    if ('stream' in part) {
      yield * (/** @type {AsyncIterableIterator<Uint8Array>} */ (part.stream()));
    } else if (ArrayBuffer.isView(part)) {
      if (clone) {
        let position = part.byteOffset;
        const end = part.byteOffset + part.byteLength;
        while (position !== end) {
          const size = Math.min(end - position, POOL_SIZE);
          const chunk = part.buffer.slice(position, position + size);
          position += chunk.byteLength;
          yield new Uint8Array(chunk);
        }
      } else {
        yield part;
      }
    /* c8 ignore next 10 */
    } else {
      // For blobs that have arrayBuffer but no stream method (nodes buffer.Blob)
      let position = 0, b = (/** @type {Blob} */ (part));
      while (position !== b.size) {
        const chunk = b.slice(position, Math.min(b.size, position + POOL_SIZE));
        const buffer = await chunk.arrayBuffer();
        position += buffer.byteLength;
        yield new Uint8Array(buffer);
      }
    }
  }
}

const _Blob = class Blob {
  /** @type {Array.<(Blob|Uint8Array)>} */
  #parts = []
  #type = ''
  #size = 0
  #endings = 'transparent'

  /**
   * The Blob() constructor returns a new Blob object. The content
   * of the blob consists of the concatenation of the values given
   * in the parameter array.
   *
   * @param {*} blobParts
   * @param {{ type?: string, endings?: string }} [options]
   */
  constructor (blobParts = [], options = {}) {
    if (typeof blobParts !== 'object' || blobParts === null) {
      throw new TypeError('Failed to construct \'Blob\': The provided value cannot be converted to a sequence.')
    }

    if (typeof blobParts[Symbol.iterator] !== 'function') {
      throw new TypeError('Failed to construct \'Blob\': The object must have a callable @@iterator property.')
    }

    if (typeof options !== 'object' && typeof options !== 'function') {
      throw new TypeError('Failed to construct \'Blob\': parameter 2 cannot convert to dictionary.')
    }

    if (options === null) options = {};

    const encoder = new TextEncoder();
    for (const element of blobParts) {
      let part;
      if (ArrayBuffer.isView(element)) {
        part = new Uint8Array(element.buffer.slice(element.byteOffset, element.byteOffset + element.byteLength));
      } else if (element instanceof ArrayBuffer) {
        part = new Uint8Array(element.slice(0));
      } else if (element instanceof Blob) {
        part = element;
      } else {
        part = encoder.encode(`${element}`);
      }

      this.#size += ArrayBuffer.isView(part) ? part.byteLength : part.size;
      this.#parts.push(part);
    }

    this.#endings = `${options.endings === undefined ? 'transparent' : options.endings}`;
    const type = options.type === undefined ? '' : String(options.type);
    this.#type = /^[\x20-\x7E]*$/.test(type) ? type : '';
  }

  /**
   * The Blob interface's size property returns the
   * size of the Blob in bytes.
   */
  get size () {
    return this.#size
  }

  /**
   * The type property of a Blob object returns the MIME type of the file.
   */
  get type () {
    return this.#type
  }

  /**
   * The text() method in the Blob interface returns a Promise
   * that resolves with a string containing the contents of
   * the blob, interpreted as UTF-8.
   *
   * @return {Promise<string>}
   */
  async text () {
    // More optimized than using this.arrayBuffer()
    // that requires twice as much ram
    const decoder = new TextDecoder();
    let str = '';
    for await (const part of toIterator(this.#parts, false)) {
      str += decoder.decode(part, { stream: true });
    }
    // Remaining
    str += decoder.decode();
    return str
  }

  /**
   * The arrayBuffer() method in the Blob interface returns a
   * Promise that resolves with the contents of the blob as
   * binary data contained in an ArrayBuffer.
   *
   * @return {Promise<ArrayBuffer>}
   */
  async arrayBuffer () {
    // Easier way... Just a unnecessary overhead
    // const view = new Uint8Array(this.size);
    // await this.stream().getReader({mode: 'byob'}).read(view);
    // return view.buffer;

    const data = new Uint8Array(this.size);
    let offset = 0;
    for await (const chunk of toIterator(this.#parts, false)) {
      data.set(chunk, offset);
      offset += chunk.length;
    }

    return data.buffer
  }

  stream () {
    const it = toIterator(this.#parts, true);

    return new globalThis.ReadableStream({
      // @ts-ignore
      type: 'bytes',
      async pull (ctrl) {
        const chunk = await it.next();
        chunk.done ? ctrl.close() : ctrl.enqueue(chunk.value);
      },

      async cancel () {
        await it.return();
      }
    })
  }

  /**
   * The Blob interface's slice() method creates and returns a
   * new Blob object which contains data from a subset of the
   * blob on which it's called.
   *
   * @param {number} [start]
   * @param {number} [end]
   * @param {string} [type]
   */
  slice (start = 0, end = this.size, type = '') {
    const { size } = this;

    let relativeStart = start < 0 ? Math.max(size + start, 0) : Math.min(start, size);
    let relativeEnd = end < 0 ? Math.max(size + end, 0) : Math.min(end, size);

    const span = Math.max(relativeEnd - relativeStart, 0);
    const parts = this.#parts;
    const blobParts = [];
    let added = 0;

    for (const part of parts) {
      // don't add the overflow to new blobParts
      if (added >= span) {
        break
      }

      const size = ArrayBuffer.isView(part) ? part.byteLength : part.size;
      if (relativeStart && size <= relativeStart) {
        // Skip the beginning and change the relative
        // start & end position as we skip the unwanted parts
        relativeStart -= size;
        relativeEnd -= size;
      } else {
        let chunk;
        if (ArrayBuffer.isView(part)) {
          chunk = part.subarray(relativeStart, Math.min(size, relativeEnd));
          added += chunk.byteLength;
        } else {
          chunk = part.slice(relativeStart, Math.min(size, relativeEnd));
          added += chunk.size;
        }
        relativeEnd -= size;
        blobParts.push(chunk);
        relativeStart = 0; // All next sequential parts should start at 0
      }
    }

    const blob = new Blob([], { type: String(type).toLowerCase() });
    blob.#size = span;
    blob.#parts = blobParts;

    return blob
  }

  get [Symbol.toStringTag] () {
    return 'Blob'
  }

  static [Symbol.hasInstance] (object) {
    return (
      object &&
      typeof object === 'object' &&
      typeof object.constructor === 'function' &&
      (
        typeof object.stream === 'function' ||
        typeof object.arrayBuffer === 'function'
      ) &&
      /^(Blob|File)$/.test(object[Symbol.toStringTag])
    )
  }
};

Object.defineProperties(_Blob.prototype, {
  size: { enumerable: true },
  type: { enumerable: true },
  slice: { enumerable: true }
});

/** @type {typeof globalThis.Blob} */
const Blob = _Blob;
var Blob$1 = Blob;

const _File = class File extends Blob$1 {
  #lastModified = 0
  #name = ''

  /**
   * @param {*[]} fileBits
   * @param {string} fileName
   * @param {{lastModified?: number, type?: string}} options
   */// @ts-ignore
  constructor (fileBits, fileName, options = {}) {
    if (arguments.length < 2) {
      throw new TypeError(`Failed to construct 'File': 2 arguments required, but only ${arguments.length} present.`)
    }
    super(fileBits, options);

    if (options === null) options = {};

    // Simulate WebIDL type casting for NaN value in lastModified option.
    const lastModified = options.lastModified === undefined ? Date.now() : Number(options.lastModified);
    if (!Number.isNaN(lastModified)) {
      this.#lastModified = lastModified;
    }

    this.#name = String(fileName);
  }

  get name () {
    return this.#name
  }

  get lastModified () {
    return this.#lastModified
  }

  get [Symbol.toStringTag] () {
    return 'File'
  }

  static [Symbol.hasInstance] (object) {
    return !!object && object instanceof Blob$1 &&
      /^(File)$/.test(object[Symbol.toStringTag])
  }
};

/** @type {typeof globalThis.File} */// @ts-ignore
const File = _File;

/*! formdata-polyfill. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */


var {toStringTag:t,iterator:i,hasInstance:h}=Symbol,
r=Math.random,
m='append,set,get,getAll,delete,keys,values,entries,forEach,constructor'.split(','),
f=(a,b,c)=>(a+='',/^(Blob|File)$/.test(b && b[t])?[(c=c!==void 0?c+'':b[t]=='File'?b.name:'blob',a),b.name!==c||b[t]=='blob'?new File([b],c,b):b]:[a,b+'']),
e=(c,f)=>(f?c:c.replace(/\r?\n|\r/g,'\r\n')).replace(/\n/g,'%0A').replace(/\r/g,'%0D').replace(/"/g,'%22'),
x=(n, a, e)=>{if(a.length<e){throw new TypeError(`Failed to execute '${n}' on 'FormData': ${e} arguments required, but only ${a.length} present.`)}};

/** @type {typeof globalThis.FormData} */
const FormData = class FormData {
#d=[];
constructor(...a){if(a.length)throw new TypeError(`Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'.`)}
get [t]() {return 'FormData'}
[i](){return this.entries()}
static [h](o) {return o&&typeof o==='object'&&o[t]==='FormData'&&!m.some(m=>typeof o[m]!='function')}
append(...a){x('append',arguments,2);this.#d.push(f(...a));}
delete(a){x('delete',arguments,1);a+='';this.#d=this.#d.filter(([b])=>b!==a);}
get(a){x('get',arguments,1);a+='';for(var b=this.#d,l=b.length,c=0;c<l;c++)if(b[c][0]===a)return b[c][1];return null}
getAll(a,b){x('getAll',arguments,1);b=[];a+='';this.#d.forEach(c=>c[0]===a&&b.push(c[1]));return b}
has(a){x('has',arguments,1);a+='';return this.#d.some(b=>b[0]===a)}
forEach(a,b){x('forEach',arguments,1);for(var [c,d]of this)a.call(b,d,c,this);}
set(...a){x('set',arguments,2);var b=[],c=!0;a=f(...a);this.#d.forEach(d=>{d[0]===a[0]?c&&(c=!b.push(a)):b.push(d);});c&&b.push(a);this.#d=b;}
*entries(){yield*this.#d;}
*keys(){for(var[a]of this)yield a;}
*values(){for(var[,a]of this)yield a;}};

/** @param {FormData} F */
function formDataToBlob (F,B=Blob$1){
var b=`${r()}${r()}`.replace(/\./g, '').slice(-28).padStart(32, '-'),c=[],p=`--${b}\r\nContent-Disposition: form-data; name="`;
F.forEach((v,n)=>typeof v=='string'
?c.push(p+e(n)+`"\r\n\r\n${v.replace(/\r(?!\n)|(?<!\r)\n/g, '\r\n')}\r\n`)
:c.push(p+e(n)+`"; filename="${e(v.name, 1)}"\r\nContent-Type: ${v.type||"application/octet-stream"}\r\n\r\n`, v, '\r\n'));
c.push(`--${b}--`);
return new B(c,{type:"multipart/form-data; boundary="+b})}

class FetchBaseError extends Error {
	constructor(message, type) {
		super(message);
		// Hide custom error implementation details from end-users
		Error.captureStackTrace(this, this.constructor);

		this.type = type;
	}

	get name() {
		return this.constructor.name;
	}

	get [Symbol.toStringTag]() {
		return this.constructor.name;
	}
}

/**
 * @typedef {{ address?: string, code: string, dest?: string, errno: number, info?: object, message: string, path?: string, port?: number, syscall: string}} SystemError
*/

/**
 * FetchError interface for operational errors
 */
class FetchError extends FetchBaseError {
	/**
	 * @param  {string} message -      Error message for human
	 * @param  {string} [type] -        Error type for machine
	 * @param  {SystemError} [systemError] - For Node.js system error
	 */
	constructor(message, type, systemError) {
		super(message, type);
		// When err.type is `system`, err.erroredSysCall contains system error and err.code contains system error code
		if (systemError) {
			// eslint-disable-next-line no-multi-assign
			this.code = this.errno = systemError.code;
			this.erroredSysCall = systemError.syscall;
		}
	}
}

/**
 * Is.js
 *
 * Object type checks.
 */

const NAME = Symbol.toStringTag;

/**
 * Check if `obj` is a URLSearchParams object
 * ref: https://github.com/node-fetch/node-fetch/issues/296#issuecomment-307598143
 * @param {*} object - Object to check for
 * @return {boolean}
 */
const isURLSearchParameters = object => {
	return (
		typeof object === 'object' &&
		typeof object.append === 'function' &&
		typeof object.delete === 'function' &&
		typeof object.get === 'function' &&
		typeof object.getAll === 'function' &&
		typeof object.has === 'function' &&
		typeof object.set === 'function' &&
		typeof object.sort === 'function' &&
		object[NAME] === 'URLSearchParams'
	);
};

/**
 * Check if `object` is a W3C `Blob` object (which `File` inherits from)
 * @param {*} object - Object to check for
 * @return {boolean}
 */
const isBlob = object => {
	return (
		object &&
		typeof object === 'object' &&
		typeof object.arrayBuffer === 'function' &&
		typeof object.type === 'string' &&
		typeof object.stream === 'function' &&
		typeof object.constructor === 'function' &&
		/^(Blob|File)$/.test(object[NAME])
	);
};

promisify(Stream.pipeline);
const INTERNALS$2 = Symbol('Body internals');

/**
 * Body mixin
 *
 * Ref: https://fetch.spec.whatwg.org/#body
 *
 * @param   Stream  body  Readable stream
 * @param   Object  opts  Response options
 * @return  Void
 */
class Body {
	constructor(body, {
		size = 0
	} = {}) {
		let boundary = null;

		if (body === null) {
			// Body is undefined or null
			body = null;
		} else if (isURLSearchParameters(body)) {
			// Body is a URLSearchParams
			body = Buffer.from(body.toString());
		} else if (isBlob(body)) ; else if (Buffer.isBuffer(body)) ; else if (types.isAnyArrayBuffer(body)) {
			// Body is ArrayBuffer
			body = Buffer.from(body);
		} else if (ArrayBuffer.isView(body)) {
			// Body is ArrayBufferView
			body = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
		} else if (body instanceof Stream) ; else if (body instanceof FormData) {
			// Body is FormData
			body = formDataToBlob(body);
			boundary = body.type.split('=')[1];
		} else {
			// None of the above
			// coerce to string then buffer
			body = Buffer.from(String(body));
		}

		let stream = body;

		if (Buffer.isBuffer(body)) {
			stream = Stream.Readable.from(body);
		} else if (isBlob(body)) {
			stream = Stream.Readable.from(body.stream());
		}

		this[INTERNALS$2] = {
			body,
			stream,
			boundary,
			disturbed: false,
			error: null
		};
		this.size = size;

		if (body instanceof Stream) {
			body.on('error', error_ => {
				const error = error_ instanceof FetchBaseError ?
					error_ :
					new FetchError(`Invalid response body while trying to fetch ${this.url}: ${error_.message}`, 'system', error_);
				this[INTERNALS$2].error = error;
			});
		}
	}

	get body() {
		return this[INTERNALS$2].stream;
	}

	get bodyUsed() {
		return this[INTERNALS$2].disturbed;
	}

	/**
	 * Decode response as ArrayBuffer
	 *
	 * @return  Promise
	 */
	async arrayBuffer() {
		const {buffer, byteOffset, byteLength} = await consumeBody(this);
		return buffer.slice(byteOffset, byteOffset + byteLength);
	}

	async formData() {
		const ct = this.headers.get('content-type');

		if (ct.startsWith('application/x-www-form-urlencoded')) {
			const formData = new FormData();
			const parameters = new URLSearchParams(await this.text());

			for (const [name, value] of parameters) {
				formData.append(name, value);
			}

			return formData;
		}

		const {toFormData} = await import('./multipart-parser-6b974aaf-44084ee5.js');
		return toFormData(this.body, ct);
	}

	/**
	 * Return raw response as Blob
	 *
	 * @return Promise
	 */
	async blob() {
		const ct = (this.headers && this.headers.get('content-type')) || (this[INTERNALS$2].body && this[INTERNALS$2].body.type) || '';
		const buf = await this.arrayBuffer();

		return new Blob$1([buf], {
			type: ct
		});
	}

	/**
	 * Decode response as json
	 *
	 * @return  Promise
	 */
	async json() {
		const text = await this.text();
		return JSON.parse(text);
	}

	/**
	 * Decode response as text
	 *
	 * @return  Promise
	 */
	async text() {
		const buffer = await consumeBody(this);
		return new TextDecoder().decode(buffer);
	}

	/**
	 * Decode response as buffer (non-spec api)
	 *
	 * @return  Promise
	 */
	buffer() {
		return consumeBody(this);
	}
}

Body.prototype.buffer = deprecate(Body.prototype.buffer, 'Please use \'response.arrayBuffer()\' instead of \'response.buffer()\'', 'node-fetch#buffer');

// In browsers, all properties are enumerable.
Object.defineProperties(Body.prototype, {
	body: {enumerable: true},
	bodyUsed: {enumerable: true},
	arrayBuffer: {enumerable: true},
	blob: {enumerable: true},
	json: {enumerable: true},
	text: {enumerable: true},
	data: {get: deprecate(() => {},
		'data doesn\'t exist, use json(), text(), arrayBuffer(), or body instead',
		'https://github.com/node-fetch/node-fetch/issues/1000 (response)')}
});

/**
 * Consume and convert an entire Body to a Buffer.
 *
 * Ref: https://fetch.spec.whatwg.org/#concept-body-consume-body
 *
 * @return Promise
 */
async function consumeBody(data) {
	if (data[INTERNALS$2].disturbed) {
		throw new TypeError(`body used already for: ${data.url}`);
	}

	data[INTERNALS$2].disturbed = true;

	if (data[INTERNALS$2].error) {
		throw data[INTERNALS$2].error;
	}

	const {body} = data;

	// Body is null
	if (body === null) {
		return Buffer.alloc(0);
	}

	/* c8 ignore next 3 */
	if (!(body instanceof Stream)) {
		return Buffer.alloc(0);
	}

	// Body is stream
	// get ready to actually consume the body
	const accum = [];
	let accumBytes = 0;

	try {
		for await (const chunk of body) {
			if (data.size > 0 && accumBytes + chunk.length > data.size) {
				const error = new FetchError(`content size at ${data.url} over limit: ${data.size}`, 'max-size');
				body.destroy(error);
				throw error;
			}

			accumBytes += chunk.length;
			accum.push(chunk);
		}
	} catch (error) {
		const error_ = error instanceof FetchBaseError ? error : new FetchError(`Invalid response body while trying to fetch ${data.url}: ${error.message}`, 'system', error);
		throw error_;
	}

	if (body.readableEnded === true || body._readableState.ended === true) {
		try {
			if (accum.every(c => typeof c === 'string')) {
				return Buffer.from(accum.join(''));
			}

			return Buffer.concat(accum, accumBytes);
		} catch (error) {
			throw new FetchError(`Could not create Buffer from response body for ${data.url}: ${error.message}`, 'system', error);
		}
	} else {
		throw new FetchError(`Premature close of server response while trying to fetch ${data.url}`);
	}
}

deprecate(
	body => body.getBoundary(),
	'form-data doesn\'t follow the spec and requires special treatment. Use alternative package',
	'https://github.com/node-fetch/node-fetch/issues/1167'
);

/**
 * Headers.js
 *
 * Headers class offers convenient helpers
 */


/* c8 ignore next 9 */
const validateHeaderName = typeof http.validateHeaderName === 'function' ?
	http.validateHeaderName :
	name => {
		if (!/^[\^`\-\w!#$%&'*+.|~]+$/.test(name)) {
			const error = new TypeError(`Header name must be a valid HTTP token [${name}]`);
			Object.defineProperty(error, 'code', {value: 'ERR_INVALID_HTTP_TOKEN'});
			throw error;
		}
	};

/* c8 ignore next 9 */
const validateHeaderValue = typeof http.validateHeaderValue === 'function' ?
	http.validateHeaderValue :
	(name, value) => {
		if (/[^\t\u0020-\u007E\u0080-\u00FF]/.test(value)) {
			const error = new TypeError(`Invalid character in header content ["${name}"]`);
			Object.defineProperty(error, 'code', {value: 'ERR_INVALID_CHAR'});
			throw error;
		}
	};

/**
 * @typedef {Headers | Record<string, string> | Iterable<readonly [string, string]> | Iterable<Iterable<string>>} HeadersInit
 */

/**
 * This Fetch API interface allows you to perform various actions on HTTP request and response headers.
 * These actions include retrieving, setting, adding to, and removing.
 * A Headers object has an associated header list, which is initially empty and consists of zero or more name and value pairs.
 * You can add to this using methods like append() (see Examples.)
 * In all methods of this interface, header names are matched by case-insensitive byte sequence.
 *
 */
class Headers extends URLSearchParams {
	/**
	 * Headers class
	 *
	 * @constructor
	 * @param {HeadersInit} [init] - Response headers
	 */
	constructor(init) {
		// Validate and normalize init object in [name, value(s)][]
		/** @type {string[][]} */
		let result = [];
		if (init instanceof Headers) {
			const raw = init.raw();
			for (const [name, values] of Object.entries(raw)) {
				result.push(...values.map(value => [name, value]));
			}
		} else if (init == null) ; else if (typeof init === 'object' && !types.isBoxedPrimitive(init)) {
			const method = init[Symbol.iterator];
			// eslint-disable-next-line no-eq-null, eqeqeq
			if (method == null) {
				// Record<ByteString, ByteString>
				result.push(...Object.entries(init));
			} else {
				if (typeof method !== 'function') {
					throw new TypeError('Header pairs must be iterable');
				}

				// Sequence<sequence<ByteString>>
				// Note: per spec we have to first exhaust the lists then process them
				result = [...init]
					.map(pair => {
						if (
							typeof pair !== 'object' || types.isBoxedPrimitive(pair)
						) {
							throw new TypeError('Each header pair must be an iterable object');
						}

						return [...pair];
					}).map(pair => {
						if (pair.length !== 2) {
							throw new TypeError('Each header pair must be a name/value tuple');
						}

						return [...pair];
					});
			}
		} else {
			throw new TypeError('Failed to construct \'Headers\': The provided value is not of type \'(sequence<sequence<ByteString>> or record<ByteString, ByteString>)');
		}

		// Validate and lowercase
		result =
			result.length > 0 ?
				result.map(([name, value]) => {
					validateHeaderName(name);
					validateHeaderValue(name, String(value));
					return [String(name).toLowerCase(), String(value)];
				}) :
				undefined;

		super(result);

		// Returning a Proxy that will lowercase key names, validate parameters and sort keys
		// eslint-disable-next-line no-constructor-return
		return new Proxy(this, {
			get(target, p, receiver) {
				switch (p) {
					case 'append':
					case 'set':
						return (name, value) => {
							validateHeaderName(name);
							validateHeaderValue(name, String(value));
							return URLSearchParams.prototype[p].call(
								target,
								String(name).toLowerCase(),
								String(value)
							);
						};

					case 'delete':
					case 'has':
					case 'getAll':
						return name => {
							validateHeaderName(name);
							return URLSearchParams.prototype[p].call(
								target,
								String(name).toLowerCase()
							);
						};

					case 'keys':
						return () => {
							target.sort();
							return new Set(URLSearchParams.prototype.keys.call(target)).keys();
						};

					default:
						return Reflect.get(target, p, receiver);
				}
			}
		});
		/* c8 ignore next */
	}

	get [Symbol.toStringTag]() {
		return this.constructor.name;
	}

	toString() {
		return Object.prototype.toString.call(this);
	}

	get(name) {
		const values = this.getAll(name);
		if (values.length === 0) {
			return null;
		}

		let value = values.join(', ');
		if (/^content-encoding$/i.test(name)) {
			value = value.toLowerCase();
		}

		return value;
	}

	forEach(callback, thisArg = undefined) {
		for (const name of this.keys()) {
			Reflect.apply(callback, thisArg, [this.get(name), name, this]);
		}
	}

	* values() {
		for (const name of this.keys()) {
			yield this.get(name);
		}
	}

	/**
	 * @type {() => IterableIterator<[string, string]>}
	 */
	* entries() {
		for (const name of this.keys()) {
			yield [name, this.get(name)];
		}
	}

	[Symbol.iterator]() {
		return this.entries();
	}

	/**
	 * Node-fetch non-spec method
	 * returning all headers and their values as array
	 * @returns {Record<string, string[]>}
	 */
	raw() {
		return [...this.keys()].reduce((result, key) => {
			result[key] = this.getAll(key);
			return result;
		}, {});
	}

	/**
	 * For better console.log(headers) and also to convert Headers into Node.js Request compatible format
	 */
	[Symbol.for('nodejs.util.inspect.custom')]() {
		return [...this.keys()].reduce((result, key) => {
			const values = this.getAll(key);
			// Http.request() only supports string as Host header.
			// This hack makes specifying custom Host header possible.
			if (key === 'host') {
				result[key] = values[0];
			} else {
				result[key] = values.length > 1 ? values : values[0];
			}

			return result;
		}, {});
	}
}

/**
 * Re-shaping object for Web IDL tests
 * Only need to do it for overridden methods
 */
Object.defineProperties(
	Headers.prototype,
	['get', 'entries', 'forEach', 'values'].reduce((result, property) => {
		result[property] = {enumerable: true};
		return result;
	}, {})
);

deprecate(() => {},
	'.data is not a valid RequestInit property, use .body instead',
	'https://github.com/node-fetch/node-fetch/issues/1000 (request)');

/*! node-domexception. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */

var nodeDomexception;
var hasRequiredNodeDomexception;

function requireNodeDomexception () {
	if (hasRequiredNodeDomexception) return nodeDomexception;
	hasRequiredNodeDomexception = 1;
	if (!globalThis.DOMException) {
	  try {
	    const { MessageChannel } = require('worker_threads'),
	    port = new MessageChannel().port1,
	    ab = new ArrayBuffer();
	    port.postMessage(ab, [ab, ab]);
	  } catch (err) {
	    err.constructor.name === 'DOMException' && (
	      globalThis.DOMException = err.constructor
	    );
	  }
	}

	nodeDomexception = globalThis.DOMException;
	return nodeDomexception;
}

requireNodeDomexception();

function vitePluginOllamaI18nTranslate(options) {
    return {
        name: "vite-plugin-ollama-i18n-translate",
        enforce: "pre",
        configResolved(config) {
            // 获取项目根目录
            config.root;
        },
        async buildStart() {
            logText(`✨ [vite-plugin-ollama-i18n-translate] Translation process started.`, 'magenta');
            console.log("---------------------");
            // 源文本
        },
    };
}

export { FormData as F, File as a, vitePluginOllamaI18nTranslate as v };
//# sourceMappingURL=index-52217ebf.js.map
