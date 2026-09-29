import type { VideoSource } from '../camera/index.ts';
import type { FrameSource } from '../vision/index.ts';

/** App composes the camera public source with the vision capture boundary. */
export function createCameraFrameSource(
  source: Pick<VideoSource, 'isReady' | 'getFrameSource'>,
  capture: (image: ImageBitmapSource) => Promise<ImageBitmap> = (image) =>
    createImageBitmap(image),
): FrameSource {
  return {
    isReady: () => source.isReady(),
    async capture() {
      const video = source.getFrameSource();
      if (!video) throw new Error('Camera video is not ready');
      return capture(video);
    },
  };
}
