import { Command as KlasaCommand, CommandStore, KlasaMessage, util } from 'klasa';

export default class Command extends KlasaCommand {

	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			aliases: ['pull'],
			description: 'Update the bot',
			guarded: true,
			permissionLevel: 10,
			usage: '[branch:string]'
		});
	}

	public async run(message: KlasaMessage, [branch = 'master']: [string?]): Promise<KlasaMessage | KlasaMessage[]> {
		const response = await this.fetch(message, branch);
		await this.compile(message);
		return message.send(response);
	}

	private async compile(message: KlasaMessage): Promise<void> {
		const { stdout, stderr } = await util.exec('yarn run compile');
		if (stderr.length) throw stderr.trim();
		await message.send(`✔ Successfully compiled.\n${util.codeBlock('prolog', stdout)}`);
		await util.sleep(2000);
	}

	private async fetch(message: KlasaMessage, branch: string): Promise<string> {
		await util.exec('git fetch');
		const { stdout, stderr } = await util.exec(`git pull origin ${branch}`);
		if (stdout.includes('Already up-to-date.')) throw '✔ Up to date.';
		if (!this.isSuccessfulPull(stdout)) {
			if (this.needsStash(stdout + stderr)) return this.stash(message);
		} else if (!await this.isCurrentBranch(branch)) {
			await this.checkout(message, branch);
		}

		return util.codeBlock('prolog', [stdout || '✔', stderr || '✔'].join('\n-=-=-=-\n'));
	}

	private async stash(message: KlasaMessage): Promise<string> {
		await message.send('Unsuccessful pull, stashing...');
		await util.sleep(1000);
		const { stdout, stderr } = await util.exec(`git stash`);
		if (!this.isSuccessfulStash(stdout + stderr)) {
			throw `Unsuccessful pull, stashing:\n\n${util.codeBlock('prolog', [stdout || '✔', stderr || '✔'].join('\n-=-=-=-\n'))}`;
		}

		return util.codeBlock('prolog', [stdout || '✔', stderr || '✔'].join('\n-=-=-=-\n'));
	}

	private async checkout(message: KlasaMessage, branch: string): Promise<void> {
		await message.send(`Switching to ${branch}...`);
		await util.exec(`git checkout ${branch}`);
	}

	private async isCurrentBranch(branch: string): Promise<boolean> {
		const { stdout } = await util.exec('git symbolic-ref --short HEAD');
		return stdout === `refs/heads/${branch}\n` || stdout === `${branch}\n`;
	}

	private isSuccessfulPull(output: string): boolean {
		return /\d+\s*file\s*changed,\s*\d+\s*insertions?\([+-]\),\s*\d+\s*deletions?\([+-]\)/.test(output);
	}

	private isSuccessfulStash(output: string): boolean {
		return output.includes('Saved working directory and index state WIP on');
	}

	private needsStash(output: string): boolean {
		return output.includes('Your local changes to the following files would be overwritten by merge');
	}

}
