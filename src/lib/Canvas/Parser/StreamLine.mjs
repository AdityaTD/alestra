import { CompilationParseError } from '../Util/ValidateError.mjs';

export const CHAR = /[a-zA-Z_]/;
export const VARCHAR = /[a-zA-Z0-9_]/;
export const QUOTES = /'|"|`/;
export const NUMBER = /\d/;
export const SPACE = /\s/;
export const HEXADECIMAL = /[0-9a-fA-F]/;
export const OCTAL = /[0-7]/;
export const BINARY = /[01]/;
export const HEXLITERALS = /\\u([0-9a-fA-F]{4})/;
export const HEXLITERALS_SHORT = /\\x([0-9a-fA-F]{2})/;
export const CHARACTER_ESCAPES = {
	b: '\b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
	v: '\v',
	0: '\0'
};

export default class StreamLine {

	/**
	 * @param {string} str The string to parse
	 */
	constructor(str) {
		this.i = 0;

		/**
		 * @type {string}
		 */
		this.string = str.trim();
	}

	*run() {
		const max = this.string.length;
		if (this.i === max) throw new Error('Already parsed');

		let char, method = '', inMethodName = false;
		while (this.i < max) {
			char = this.string.charAt(this.i);
			if (SPACE.test(char)) {
				if (inMethodName) throw new CompilationParseError(`Unexpected identifier '${method} ' is not a valid method name.`);
				this.i++;
				continue;
			}
			if (char === '.') {
				if (inMethodName) throw new CompilationParseError(`Unexpected token '${char}'. Expected a method name, but got two dots.`);
				inMethodName = true;
				this.i++;
				continue;
			}
			if (char === '(') {
				if (!method.length) throw new CompilationParseError(`Unexpected token '${char}'. Expected a method name, but none was given.`);
				const parsed = StreamLine.parseArguments(method, this.string, this.i + 1, false);
				this.i = parsed.position;

				yield [method, parsed.output];

				inMethodName = false;
				method = '';
				continue;
			}
			if (char === ')') {
				this.i++;
				continue;
			}
			if (VARCHAR.test(char)) {
				if (!inMethodName) throw new CompilationParseError(`Unexpected token '${char}'. Expected a method name after a dot, got a literal outside the method chain.`);
				if (method.length === 0 && char >= '0' && char <= '9') throw new CompilationParseError(`Unexpected token '${char}'. Expected a character in the pattern 'a-zA-Z_' as first character.`);
				method += char;
				this.i++;
				continue;
			}
			if (char === '/') {
				const nextChar = this.string.charAt(this.i + 1);
				if (nextChar === '/') {
					const index = this.string.indexOf('\n', this.i + 1);
					this.i = index === -1 ? max : index;
					continue;
				}
				if (nextChar === '*') {
					const index = this.string.indexOf('*/', this.i + 1);
					this.i = index === -1 ? max : index;
					continue;
				}
			}

			throw new CompilationParseError(`Invalid or unexpected token '${char}'..`);
		}
	}

	static parseArguments(method, string, i, array) {
		const output = [], lastChar = array ? ']' : ')';

		let char, temp = null;
		while (char !== lastChar || i < string.length) {
			char = string.charAt(i);
			if (QUOTES.test(char)) {
				temp = StreamLine.parseString(string, i, lastChar);
			} else if (NUMBER.test(char)) {
				temp = StreamLine.parseNumber(string, i, lastChar);
			} else if (VARCHAR.test(char)) {
				temp = StreamLine.parseVariable(string, i, lastChar);
			} else if (char === '{') {
				temp = StreamLine.parseObject(string, i, lastChar);
			} else if (char === '[') {
				temp = StreamLine.parseArguments(string, i + 1, true);
			} else if (SPACE.test(char)) {
				i++;
			} else if (char === ',') {
				temp = { output: undefined, position: i + 1 };
			} else if (char === lastChar) {
				i++;
				break;
			}

			if (temp) {
				output.push(temp.output);
				i = temp.position;
				temp = null;


				while (i < string.length) {
					char = string.charAt(i++);
					if (char === ',') break;
					if (char === lastChar) {
						i--;
						break;
					}
					if (!SPACE.test(char))
						throw new CompilationParseError(`Unexpected token ${char} at method ${method}.`);
				}
			}
		}

		return { output, position: i };
	}

	/**
	 * @param {string} string The string to parse
	 * @param {number} i The current position
	 * @returns {any}
	 */
	static parseString(string, i) {
		const quote = string.charAt(i++);
		const templateLiteral = quote === '`';

		let char, nextChar, output = '';
		while (i < string.length) {
			char = string.charAt(i);

			if (char === '\\') {
				nextChar = string.charAt(i + 1);
				if (nextChar === '\\') {
					output += '\\';
					i += 2;
				} else if (nextChar === quote) {
					output += quote;
					i += 2;
				} else if (nextChar === '\n') {
					output += '\n';
					i += 2;
				} else if (nextChar === 'x') {
					const frag = string.slice(i, i + 4);
					if (!HEXLITERALS_SHORT.test(frag)) throw new CompilationParseError(`Invalid Unicode escape sequence '${frag}'`);
					output += String.fromCharCode(parseInt(HEXLITERALS_SHORT.exec(frag)[1], 16));
					i += 4;
				} else if (nextChar === 'u') {
					// \u200B
					const frag = string.slice(i, i + 6);
					if (!HEXLITERALS.test(frag)) throw new CompilationParseError(`Invalid Unicode escape sequence '${frag}'`);
					output += String.fromCharCode(parseInt(HEXLITERALS.exec(frag)[1], 16));
					i += 6;
				} else if (nextChar in CHARACTER_ESCAPES) {
					output += CHARACTER_ESCAPES[nextChar];
					i += 2;
				}
			} else if (char === '\n' && !templateLiteral) {
				throw new CompilationParseError(`Detected unescaped newline outside a template literal after '${output}'. Expected a escape character sequence or a template literal.`);
			} else {
				i++;
				if (char === quote) break;
				output += char;
			}
		}

		if (i === string.length) {
			throw new CompilationParseError(templateLiteral
				? `Detected unterminated template literal after '${output}'. Expected the template literal to be closed with '\`'`
				: `Detected unterminated string after '${output}'. Expected the string to be closed with ${quote === '"' ? "'\"'" : '"\'"'}.`);
		}

		return { output, position: i };
	}

	/**
	 * @param {string} string The string to parse
	 * @param {number} i The current position
	 * @param {string} lastChar The last character this must encounter if it does not find a comma before
	 * @returns {any}
	 */
	static parseNumber(string, i, lastChar) { // eslint-disable-line complexity
		let raw = '', char, inDecimals = false;

		const first = string.charAt(i++);
		const second = string.charAt(i++);

		if (second === '' || second === ',' || second === lastChar)
			return { output: Number(first), position: i - 1 };

		if (second === 'x')
			return StreamLine._parseNumber(string, i, lastChar, HEXADECIMAL, 16);

		if (second === 'o')
			return StreamLine._parseNumber(string, i, lastChar, OCTAL, 8);

		if (second === 'b')
			return StreamLine._parseNumber(string, i, lastChar, BINARY, 2);

		raw = NUMBER.test(second) ? first + second : first;
		while (i < string.length) {
			char = string.charAt(i++);
			if (NUMBER.test(char)) {
				raw += char;
			} else if (char === '.') {
				if (inDecimals) throw new CompilationParseError(`Unexpected end of input. Cannot parse '${raw}' to a number.`);
				else inDecimals = true;
			} else if (SPACE.test(char)) {
				break;
			} else if (char === ',' || char === lastChar) {
				i--;
				break;
			} else if (char === '_') {
				i++;
			} else {
				throw new CompilationParseError(`Unexpected end of input. Cannot parse '${raw}' to a number.`);
			}
		}

		return { output: Number(raw), position: i };
	}

	static parseObject(string, i) {
		let level = 0, raw = '', char;

		while (i < string.length) {
			char = string.charAt(i++);
			raw += char;
			if (char === '{') {
				level++;
			} else if (char === '}') {
				if (level === 0) throw new CompilationParseError(`Unexpected end of input. Cannot parse '${raw}' to an object.`);
				if (level === 1) break;
				level--;
			}
		}

		return { output: StreamLine._parseObject(raw), position: i };
	}

	static _parseNumber(string, i, lastChar, reg, base) {
		let char, raw = '';

		while (i < string.length) {
			char = string.charAt(i++);
			if (reg.test(char)) raw += char;
			else if (char === ',' || char === lastChar) break;
			else if (SPACE.test(char)) break;
			else throw new Error();
		}

		if (raw === '') throw new CompilationParseError('Invalid or unexpected token');

		return { output: parseInt(raw, base), position: i };
	}

	static _parseObject(string) {
		const fixed = string.replace(/([^"])(\w[\w\d]*):/g, '$1"$2":').replace(/:\s*'([^']*)'/g, ':"$1"');

		try {
			const parsed = JSON.parse(fixed);
			return parsed;
		} catch (_) {
			throw new CompilationParseError(`Could not parse the JSON object \`${string}\`.`);
		}
	}

}

for (const [method, args] of new StreamLine(`
	.setColor(\`#2C2F33)
	.addRect(0, 0, 84, 180)
	.addRect(169, 26, 231, 46)
	.addRect(224, 108, 176, 46)
	.setShadowColor("rgba(22, 22, 22, 1)")
	.setShadowOffsetY(5)
	.setShadowBlur(10)
	.addCircle(84, 90, 62)
	.setColor("#23272A")
	.addBeveledRect(20, 138, 128, 32, 5)
	.setTextAlign("center")
	.setColor("#FFFFFF")
	.addText("Level Up!", 285, 54)
	.addText("IPv6#0088", 84, 159)
	.setTextAlign("left")
	.addRoundImage("https://cdn.discordapp.com/avatars/425938842348945408/47b5f737756848f66cc8329f6cbd108d.png?size=2048", 20, 128, 128, 128)
	.addText("Level 105", 241, 136)
`).run()) console.log(method, args);