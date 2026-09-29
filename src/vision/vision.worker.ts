import { VisionWorkerRuntime } from './VisionWorkerRuntime.ts';
import { loadRecognizer } from './loadRecognizer.ts';
import type { VisionResponse } from './vision.messages.ts';

const scope = globalThis as unknown as {
  postMessage(message: VisionResponse): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
};
const runtime = new VisionWorkerRuntime(loadRecognizer, (message) =>
  scope.postMessage(message),
);
scope.onmessage = (event) => {
  void runtime.receive(event.data);
};
