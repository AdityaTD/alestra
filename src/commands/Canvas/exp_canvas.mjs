import { Command as KlasaCommand, Stopwatch, util as KlasaUtil } from 'klasa';
import { inspect } from 'util';
import { parse } from '../../lib/WorkerCaller';

const CODEBLOCK = /^```(?:js|javascript)?([\s\S]+)```$/;

export default class Command extends KlasaCommand {

	constructor(...args) {
		super(...args, {
			runIn: ['text'],
			requiredPermissions: ['ATTACH_FILES'],
			bucket: 1,
			cooldown: 10,
			description: 'Render a Canvas-Constructor',
			extendedHelp: 'No extended help available.',
			usage: '<code:string>'
		});
	}

	async run(message, [code]) {
		const sw = new Stopwatch(5);
		try {
			const output = await parse(this.parseCodeblock(code), this.parseFlags(message.flags.vars));
			return message.channel.send(`\`✔\` \`⏱ ${sw.stop()}\`\n${KlasaUtil.codeBlock('js', inspect(output, false, 0, false))}`);
		} catch (error) {
			if (sw.running) sw.stop();
			throw `\`❌\` \`⏱ ${sw}\`\n${KlasaUtil.codeBlock('', 'stack' in message.flags && message.author.id === this.client.owner.id ? error.stack : error)}`;
		}
	}

	parseCodeblock(code) {
		return CODEBLOCK.test(code) ? CODEBLOCK.exec(code)[1].trim() : code;
	}

	parseFlags(flags) {
		if (typeof flags !== 'string') return [];
		const vars = flags.split(',');
		return vars.map(flag => {
			const index = flag.indexOf('=');
			if (index === -1) throw `Could not parse '${flag}': There is no assignment.`;
			return [flag.slice(0, index), flag.slice(index + 1)];
		});
	}

}
