import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { VisionAssetError } from './VisionWorkerRuntime.ts';
import type { InitRequest, VisionResource } from './VisionWorkerRuntime.ts';
import { fetchVisionAsset } from './verifyVisionAsset.ts';
import { normalizeResult } from './ResultNormalizer.ts';

export async function loadRecognizer(
  request: InitRequest,
): Promise<VisionResource> {
  const model = await fetchVisionAsset(request.assets.modelUrl, 'MODEL');
  const files = await FilesetResolver.forVisionTasks(request.assets.wasmRoot);
  const script = await fetchVisionAsset(files.wasmLoaderPath, 'SCRIPT');
  const wasm = await fetchVisionAsset(files.wasmBinaryPath, 'WASM');
  const loaderUrl = URL.createObjectURL(
    new Blob([script], { type: 'application/javascript' }),
  );
  const binaryUrl = URL.createObjectURL(
    new Blob([wasm], { type: 'application/wasm' }),
  );
  try {
    const recognizer = await GestureRecognizer.createFromOptions(
      { wasmLoaderPath: loaderUrl, wasmBinaryPath: binaryUrl },
      {
        baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: request.options.numHands,
      },
    );
    let closed = false;
    const now = () => performance.timeOrigin + performance.now();
    return {
      close() {
        if (!closed) {
          closed = true;
          recognizer.close();
        }
      },
      processFrame(bitmap, metadata) {
        if (closed) throw new Error('Recognizer is closed');
        const start = now();
        const result = recognizer.recognizeForVideo(
          bitmap,
          metadata.captureTimeMs,
        );
        const end = now();
        return normalizeResult(
          result,
          metadata,
          end,
          end - start,
          request.options,
        );
      },
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    throw new VisionAssetError(
      /wasm|WebAssembly|ModuleFactory|importScripts/.test(message)
        ? 'E-VIS-002'
        : 'E-VIS-001',
      'INITIALIZATION',
    );
  } finally {
    URL.revokeObjectURL(loaderUrl);
    URL.revokeObjectURL(binaryUrl);
  }
}
