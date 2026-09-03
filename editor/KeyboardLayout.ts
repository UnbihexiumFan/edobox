// Copyright (c) 2012-2022 John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {Config} from "../synth/SynthConfig";
import {createKeys, createScales} from "../synth/CreateScalesAndKeys";
import {SongDocument} from "./SongDocument";

let edo = doc.song.edo;
let fifth = Math.round(edo * Math.log2(3/2)); //best fifth
let whole = 2 * fifth - edo; // whole step
let half = edo * 3 - fifth * 5; // diatonic half step (i.e. B-C, E-F)
let neu = Math.round(edo * Math.log2(12/11)); //neutral 2nd
export class KeyboardLayout {
	private static _pianoAtC: ReadonlyArray<ReadonlyArray<number | null>> = [
		[0,    whole,     2*whole,         2*whole+half,     fifth,         fifth+whole,       fifth+2*whole,       edo,        edo+whole,        edo+2*whole,   edo+2*whole+half    ],
		[null, half,      whole+half,      null,             edo-3*whole,   edo-2*whole,       edo-whole, null,     edo+half,   edo+whole+half,   null,          2*edo-3*whole       ],
		[edo,  edo+whole, edo+2*whole,     edo+2*whole+half, edo+fifth,     edo+fifth+whole,   edo+fifth+2*whole,   2*edo,      2*edo+whole,      2*edo+2*whole, 2*edo+2*whole+half, 2*edo+fifth, 2*edo+fifth+whole],
		[null, edo+half,  edo+whole+half,  null,             2*edo-3*whole, 2*edo-2*whole,     2*edo-whole, null,   2*edo+half, 2*edo+whole+half, null,          3*edo-3*whole,      3*edo-2*whole],
	];
	private static _pianoAtA: ReadonlyArray<ReadonlyArray<number | null>> = [
		[0,              whole,     whole+half,     2*whole+half,     fifth,         edo-2*whole,   edo-whole,          edo,              edo+whole,   edo+whole+half,   edo+2*whole+half    ],
		[half-whole,     half,      null,           whole+2*half,     edo-3*whole,   null,          edo-2*whole+half,   edo-whole+half,   edo+half,    null,             edo+whole+2*half,   2*edo-3*whole  ],
		[edo,            edo+whole, edo+whole+half, edo+2*whole+half, edo+fifth,     2*edo-2*whole, 2*edo-whole,        2*edo,            2*edo+whole, 2*edo+whole+half, 2*edo+2*whole+half, 2*edo+fifth,   3*edo-2*whole],
		[edo-whole+half, edo+half,  null,           edo+whole+2*half, 2*edo-3*whole, null,          2*edo-2*whole+half, 2*edo-whole+half, 2*edo+half,  null,             2*edo+whole+2*half, 3*edo-3*whole, null         ],
	];
	private static _pianoInCNeu: ReadonlyArray<ReadonlyArray<number | null>> = [
		[0,             whole,     whole+neu,     whole+2*neu,     fifth,           fifth+neu,     edo-neu,     edo,             edo+whole,   edo+whole+neu,   edo+whole+2*neu],
		[neu-whole,     neu,       2*neu,         null,            whole+3*neu,     null,          edo-whole,   edo+neu-whole,   edo+neu,     edo+2*neu,       null,              edo+whole+3*neu    ],
		[edo,           edo+whole, edo+whole+neu, edo+whole+2*neu, edo+fifth,       edo+fifth+neu, 2*edo-neu,   2*edo,           2*edo+whole, 2*edo+whole+neu, 2*edo+whole+2*neu, 2*edo+fifth,       2*edo+fifth+neu],
		[edo+neu-whole, edo+neu,   edo+2*neu,     null,            edo+whole+3*neu, null,          2*edo-whole, 2*edo+neu-whole, 2*edo+neu,   2*edo+2*neu,     null,              2*edo+whole+3*neu, null           ],
	];

	public static keyPosToPitch(doc: SongDocument, x: number, y: number, keyboardLayout: string): number | null {
		let pitchOffset: number | null = null;
		let forcedKey: number | null = null;
		switch (keyboardLayout) {
			case "wickiHayden":
				pitchOffset = y * 5 + x * 2 - 2;
				break;
			case "songScale":
				const scaleFlags: ReadonlyArray<boolean> = createScales(doc.song.edo)[doc.song.scale].flags;
				const scaleIndices: number[] = <number[]> scaleFlags.map((flag, index) => flag ? index : null).filter((index) => index != null);
				pitchOffset = (y - 1 + Math.floor(x / scaleIndices.length)) * doc.song.edo + scaleIndices[(x + scaleIndices.length) % scaleIndices.length];
				break;
			case "pianoAtC":
				pitchOffset = KeyboardLayout._pianoAtC[y][x];
				forcedKey = createKeys(doc.song.edo).dictionary["C"].basePitch;
				break;
			case "pianoAtA":
				pitchOffset = KeyboardLayout._pianoAtA[y][x];
				forcedKey = createKeys(doc.song.edo).dictionary["A"].basePitch;
				break;
			case "pianoInCNeu":
				if (2 * neu == 2 * edo - 3 * fifth) {
					pitchOffset = KeyboardLayout._pianoInCNeu[y][x];
					forcedKey = createKeys(doc.song.edo).dictionary["C"].basePitch;
				}
				break;
			case "pianoTransposingC":
				pitchOffset = KeyboardLayout._pianoAtC[y][x];
				break;
			case "pianoTransposingA":
				pitchOffset = KeyboardLayout._pianoAtA[y][x];
				break;
			case "pianoTransposingCNeu":
				if (2 * neu == 2 * edo - 3 * fifth) {
					pitchOffset = KeyboardLayout._pianoInCNeu [y][x];
				}
				break;
		}
		
		if (pitchOffset == null) return null;
		
		const octaveOffset: number = Math.max(0, doc.song.channels[doc.channel].octave - 1) * doc.song.edo;
		let keyOffset: number = 0; // The basePitch of the song key is implicit.
		
		if (forcedKey != null) {
			const keyBasePitch: number = createKeys(doc.song.edo)[doc.song.key].basePitch;
			keyOffset = forcedKey - keyBasePitch;
		}
		
		const pitch = octaveOffset + keyOffset + pitchOffset;
		if (pitch < 0 || pitch > doc.song.edo * Config.pitchOctaves) return null;
			
		return pitch;
	}
	
	private _possiblyPlayingPitchesFromKeyboard: boolean = false;
	
	constructor(private _doc: SongDocument) {
		window.addEventListener("blur", this._onWindowBlur);
	}
	
	private _onWindowBlur = (event: Event) => {
		// Browsers don't explicitly release keys when the page isn't in focus so let's just assume they're all released.
		if (this._possiblyPlayingPitchesFromKeyboard) {
			this._doc.performance.clearAllPitches();
			this._possiblyPlayingPitchesFromKeyboard = false;
		}
	}
	
	public handleKeyEvent(event: KeyboardEvent, pressed: boolean): void {
		// See: https://www.w3.org/TR/uievents-code/#key-alphanumeric-writing-system
		switch (event.code) {
			case "Backquote": this.handleKey(-1, 3, pressed); break;
			case "Digit1": this.handleKey(0, 3, pressed); break;
			case "Digit2": this.handleKey(1, 3, pressed); break;
			case "Digit3": this.handleKey(2, 3, pressed); break;
			case "Digit4": this.handleKey(3, 3, pressed); break;
			case "Digit5": this.handleKey(4, 3, pressed); break;
			case "Digit6": this.handleKey(5, 3, pressed); break;
			case "Digit7": this.handleKey(6, 3, pressed); break;
			case "Digit8": this.handleKey(7, 3, pressed); break;
			case "Digit9": this.handleKey(8, 3, pressed); break;
			case "Digit0": this.handleKey(9, 3, pressed); break;
			case "Minus": this.handleKey(10, 3, pressed); break;
			case "Equal": this.handleKey(11, 3, pressed); break;
			case "IntlYen": this.handleKey(12, 3, pressed); break; // Present on Russian and Japanese keyboards.
			
			case "KeyQ": this.handleKey(0, 2, pressed); break;
			case "KeyW": this.handleKey(1, 2, pressed); break;
			case "KeyE": this.handleKey(2, 2, pressed); break;
			case "KeyR": this.handleKey(3, 2, pressed); break;
			case "KeyT": this.handleKey(4, 2, pressed); break;
			case "KeyY": this.handleKey(5, 2, pressed); break;
			case "KeyU": this.handleKey(6, 2, pressed); break;
			case "KeyI": this.handleKey(7, 2, pressed); break;
			case "KeyO": this.handleKey(8, 2, pressed); break;
			case "KeyP": this.handleKey(9, 2, pressed); break;
			case "BracketLeft": this.handleKey(10, 2, pressed); break;
			case "BracketRight": this.handleKey(11, 2, pressed); break;
			case "Backslash":
				// Present on US keyboards... but on non-US keyboards it's also used at a different location, see "IntlHash" below. :/
				if (event.key == "\\" || event.key == "|") {
					this.handleKey(12, 2, pressed);
				} else {
					this.handleKey(11, 1, pressed);
				}
				break;
			
			case "KeyA": this.handleKey(0, 1, pressed); break;
			case "KeyS": this.handleKey(1, 1, pressed); break;
			case "KeyD": this.handleKey(2, 1, pressed); break;
			case "KeyF": this.handleKey(3, 1, pressed); break;
			case "KeyG": this.handleKey(4, 1, pressed); break;
			case "KeyH": this.handleKey(5, 1, pressed); break;
			case "KeyJ": this.handleKey(6, 1, pressed); break;
			case "KeyK": this.handleKey(7, 1, pressed); break;
			case "KeyL": this.handleKey(8, 1, pressed); break;
			case "Semicolon": this.handleKey(9, 1, pressed); break;
			case "Quote": this.handleKey(10, 1, pressed); break;
			case "IntlHash": this.handleKey(11, 1, pressed); break; // Present on non-US keyboards... but in practice it is actually represented as "Backslash" so this is obsolete. Oh well. :/
			
			case "IntlBackslash": this.handleKey(-1, 0, pressed); break; // Present on Brazillian and many European keyboards.
			case "KeyZ": this.handleKey(0, 0, pressed); break;
			case "KeyX": this.handleKey(1, 0, pressed); break;
			case "KeyC": this.handleKey(2, 0, pressed); break;
			case "KeyV": this.handleKey(3, 0, pressed); break;
			case "KeyB": this.handleKey(4, 0, pressed); break;
			case "KeyN": this.handleKey(5, 0, pressed); break;
			case "KeyM": this.handleKey(6, 0, pressed); break;
			case "Comma": this.handleKey(7, 0, pressed); break;
			case "Period": this.handleKey(8, 0, pressed); break;
			case "Slash": this.handleKey(9, 0, pressed); break;
			case "IntlRo": this.handleKey(10, 0, pressed); break; // Present on Brazillian and Japanese keyboards.
			
			default: return; //unhandled, don't prevent default.
		}
		
		// If the key event was handled as a note, prevent default behavior.
		event.preventDefault();
	}
	
	public handleKey(x: number, y: number, pressed: boolean): void {
		
		const isDrum: boolean = this._doc.song.getChannelIsNoise(this._doc.channel);
		if (isDrum) {
			if (x >= 0 && x < Config.drumCount) {
				if (pressed) {
					this._doc.synth.preferLowerLatency = true;
					this._doc.performance.addPerformedPitch(x);
					this._possiblyPlayingPitchesFromKeyboard = true;
				} else {
					this._doc.performance.removePerformedPitch(x);
				}
			}
			return;
		}
		
		const pitch: number | null = KeyboardLayout.keyPosToPitch(this._doc, x, y, this._doc.prefs.keyboardLayout);
		
		if (pitch != null) {
			if (pressed) {
				this._doc.synth.preferLowerLatency = true;
				this._doc.performance.addPerformedPitch(pitch);
				this._possiblyPlayingPitchesFromKeyboard = true;
			} else {
				this._doc.performance.removePerformedPitch(pitch);
			}
		}
	}
}
