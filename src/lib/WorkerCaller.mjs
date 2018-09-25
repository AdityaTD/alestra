import { Worker } from 'worker_threads';

export function parse(code, flags) {
	return new Promise((resolve, reject) => {
		const worker = new Worker('./src/lib/Worker.js', {
			workerData: { code, flags }
		});

		worker.on('message', (message) => {
			if (message.ok) resolve(message.output);
			else reject(message.output);
		});
		worker.on('error', reject);
		worker.on('exit', (exitCode) => {
			if (exitCode !== 0)
				reject(new Error(`Worker stopped with exit code ${exitCode}`));
		});
	});
}
