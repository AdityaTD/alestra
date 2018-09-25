import { workerData, parentPort } from 'worker_threads';
import Evaluator from './Canvas/Parser/Evaluator.mjs';
import * as CanvasConstructor from 'canvas-constructor';

const { Canvas, ..._methods } = CanvasConstructor;
const methods = Object.entries(_methods);

const evaluator = new Evaluator();
(async () => {
	try {
		const output = await evaluator.parse(workerData.code, methods.concat(workerData.flags));
		return { ok: true, output: output instanceof Canvas ? await output.toBufferAsync() : output };
	} catch (error) {
		return { ok: false, output: error };
	}
})().then(value => parentPort.postMessage(value));
