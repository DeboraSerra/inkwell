// Reads the barcodes in a photo, in the browser: the photo is never uploaded.
// Uses the browser's own Barcode Detection API where it reads EAN-13 (Chrome on
// Android), and otherwise the `barcode-detector` package (Safari, Firefox,
// desktop), loaded only when a scan starts so it never weighs on other pages.
import type { BarcodeReader } from "@/types/ui.type";

// Big phone photos are scaled down first: faster, and often read better.
const MAX_SIDE = 1600;

let reader: Promise<BarcodeReader> | undefined;

async function nativeReader(): Promise<BarcodeReader | null> {
  const Native = (globalThis as { BarcodeDetector?: typeof import("barcode-detector/ponyfill").BarcodeDetector })
    .BarcodeDetector;
  if (!Native) return null;
  try {
    const formats = await Native.getSupportedFormats();
    return formats.includes("ean_13") ? new Native({ formats: ["ean_13"] }) : null;
  } catch {
    return null;
  }
}

async function packageReader(): Promise<BarcodeReader> {
  const { BarcodeDetector, ZXING_WASM_VERSION, prepareZXingModule } = await import("barcode-detector/ponyfill");
  // The reader's .wasm comes from the app (scripts/copy-zxing-wasm.mjs), not a CDN.
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? `/vendor/zxing-wasm/${ZXING_WASM_VERSION}/${path}` : prefix + path,
    },
  });
  return new BarcodeDetector({ formats: ["ean_13"] });
}

const getReader = () => {
  reader ??= nativeReader().then((native) => native ?? packageReader());
  // A failed load can be retried on the next scan.
  reader.catch(() => {
    reader = undefined;
  });
  return reader;
};

// Draws an image or a video frame onto a canvas, scaled down to MAX_SIDE.
function drawScaled(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function toCanvas(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = drawScaled(bitmap, bitmap.width, bitmap.height, document.createElement("canvas"));
  bitmap.close();
  return canvas;
}

// The raw values of every barcode found, or none.
export async function readBarcodes(file: File): Promise<string[]> {
  const [canvas, detector] = await Promise.all([toCanvas(file), getReader()]);
  const found = await detector.detect(canvas);
  return found.map(({ rawValue }) => rawValue);
}

// Loads the reader ahead of the first frame, so live scanning starts reading
// as soon as the video plays.
export const prepareReader = () => getReader().then(() => undefined);

// The raw values of every barcode in the video's current frame. `canvas` is
// reused across frames, so a live scan doesn't create one per frame.
export async function readVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string[]> {
  if (!video.videoWidth || !video.videoHeight) return [];
  const detector = await getReader();
  const found = await detector.detect(drawScaled(video, video.videoWidth, video.videoHeight, canvas));
  return found.map(({ rawValue }) => rawValue);
}
