import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The barcode-detector package, used where the browser has no reader of its own.
const ponyfill = vi.hoisted(() => ({
  detect: vi.fn(),
  constructed: [] as unknown[],
  prepareZXingModule: vi.fn(),
}));
vi.mock("barcode-detector/ponyfill", () => ({
  ZXING_WASM_VERSION: "9.9.9",
  prepareZXingModule: ponyfill.prepareZXingModule,
  BarcodeDetector: class {
    constructor(options: unknown) {
      ponyfill.constructed.push(options);
    }
    detect = ponyfill.detect;
  },
}));

// A browser's own BarcodeDetector.
const native = { detect: vi.fn(), formats: ["ean_13", "qr_code"] as string[], constructed: [] as unknown[] };
class NativeBarcodeDetector {
  static getSupportedFormats = vi.fn(async () => native.formats);
  constructor(options: unknown) {
    native.constructed.push(options);
  }
  detect = native.detect;
}

type Canvas = { width: number; height: number; drawn: unknown[]; getContext: () => { drawImage: (...args: unknown[]) => void } };
const canvases: Canvas[] = [];
const newCanvas = (): Canvas => {
  const canvas: Canvas = {
    width: 0,
    height: 0,
    drawn: [],
    getContext: () => ({ drawImage: (...args) => canvas.drawn.push(args) }),
  };
  return canvas;
};
const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() });

// The reader is kept per page, so every test loads a fresh copy of the module.
const load = async () => {
  vi.resetModules();
  return import("@/components/pages/books/new/barcode-scan");
};
const photo = new File(["x"], "barcode.jpg", { type: "image/jpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  canvases.length = 0;
  native.constructed.length = 0;
  native.formats = ["ean_13", "qr_code"];
  ponyfill.constructed.length = 0;
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      expect(tag).toBe("canvas");
      const canvas = newCanvas();
      canvases.push(canvas);
      return canvas;
    },
  });
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap(800, 600)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readBarcodes", () => {
  it("uses the browser's reader when it reads EAN-13", async () => {
    vi.stubGlobal("BarcodeDetector", NativeBarcodeDetector);
    native.detect.mockResolvedValue([{ rawValue: "9780441013593" }]);
    const { readBarcodes } = await load();
    await expect(readBarcodes(photo)).resolves.toEqual(["9780441013593"]);
    expect(native.constructed).toEqual([{ formats: ["ean_13"] }]);
    expect(ponyfill.constructed).toHaveLength(0);
  });

  it("falls back to the package when the browser's reader can't read EAN-13", async () => {
    vi.stubGlobal("BarcodeDetector", NativeBarcodeDetector);
    native.formats = ["qr_code"];
    ponyfill.detect.mockResolvedValue([{ rawValue: "9780441013593" }]);
    const { readBarcodes } = await load();
    await expect(readBarcodes(photo)).resolves.toEqual(["9780441013593"]);
    expect(native.constructed).toHaveLength(0);
    expect(ponyfill.constructed).toEqual([{ formats: ["ean_13"] }]);
  });

  it("falls back to the package when the browser has no reader", async () => {
    ponyfill.detect.mockResolvedValue([]);
    const { readBarcodes } = await load();
    await expect(readBarcodes(photo)).resolves.toEqual([]);
    expect(ponyfill.constructed).toHaveLength(1);
  });

  it("falls back to the package when the browser's formats can't be listed", async () => {
    vi.stubGlobal("BarcodeDetector", NativeBarcodeDetector);
    NativeBarcodeDetector.getSupportedFormats.mockRejectedValueOnce(new Error("not allowed"));
    ponyfill.detect.mockResolvedValue([]);
    const { readBarcodes } = await load();
    await readBarcodes(photo);
    expect(ponyfill.constructed).toHaveLength(1);
  });

  it("loads the package's WASM from the app, not a CDN", async () => {
    ponyfill.detect.mockResolvedValue([]);
    const { readBarcodes } = await load();
    await readBarcodes(photo);
    const { locateFile } = ponyfill.prepareZXingModule.mock.calls[0][0].overrides;
    expect(locateFile("zxing_reader.wasm", "https://cdn.example/")).toBe("/vendor/zxing-wasm/9.9.9/zxing_reader.wasm");
    expect(locateFile("zxing_reader.js", "/base/")).toBe("/base/zxing_reader.js");
  });

  it("scales a big photo down to 1600 px on its longest side and frees the bitmap", async () => {
    const big = bitmap(4000, 3000);
    vi.mocked(createImageBitmap).mockResolvedValue(big as never);
    ponyfill.detect.mockResolvedValue([]);
    const { readBarcodes } = await load();
    await readBarcodes(photo);
    expect(canvases[0]).toMatchObject({ width: 1600, height: 1200 });
    expect(canvases[0].drawn).toEqual([[big, 0, 0, 1600, 1200]]);
    expect(ponyfill.detect).toHaveBeenCalledWith(canvases[0]);
    expect(big.close).toHaveBeenCalled();
  });

  it("never scales a small photo up", async () => {
    ponyfill.detect.mockResolvedValue([]);
    const { readBarcodes } = await load();
    await readBarcodes(photo);
    expect(canvases[0]).toMatchObject({ width: 800, height: 600 });
  });

  it("creates the reader once for every scan", async () => {
    ponyfill.detect.mockResolvedValue([]);
    const { readBarcodes } = await load();
    await readBarcodes(photo);
    await readBarcodes(photo);
    expect(ponyfill.constructed).toHaveLength(1);
  });

  it("retries loading the reader after a failure", async () => {
    vi.stubGlobal("BarcodeDetector", NativeBarcodeDetector);
    NativeBarcodeDetector.getSupportedFormats.mockRejectedValueOnce(new Error("no"));
    // The fallback fails too, once.
    ponyfill.prepareZXingModule.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    native.detect.mockResolvedValue([{ rawValue: "9780441013593" }]);
    const { readBarcodes } = await load();
    await expect(readBarcodes(photo)).rejects.toThrow("offline");
    await expect(readBarcodes(photo)).resolves.toEqual(["9780441013593"]);
  });
});

describe("prepareReader", () => {
  it("loads the reader ahead of the first scan", async () => {
    ponyfill.detect.mockResolvedValue([]);
    const { prepareReader, readBarcodes } = await load();
    await expect(prepareReader()).resolves.toBeUndefined();
    expect(ponyfill.constructed).toHaveLength(1);
    await readBarcodes(photo);
    expect(ponyfill.constructed).toHaveLength(1);
  });
});

describe("readVideoFrame", () => {
  const video = (videoWidth: number, videoHeight: number) => ({ videoWidth, videoHeight }) as HTMLVideoElement;

  it("reads the current frame onto the canvas it's given", async () => {
    ponyfill.detect.mockResolvedValue([{ rawValue: "9780441013593" }]);
    const { readVideoFrame } = await load();
    const canvas = newCanvas();
    const frame = video(1920, 1080);
    await expect(readVideoFrame(frame, canvas as never)).resolves.toEqual(["9780441013593"]);
    expect(canvas).toMatchObject({ width: 1600, height: 900 });
    expect(canvas.drawn).toEqual([[frame, 0, 0, 1600, 900]]);
    expect(canvases).toHaveLength(0);
  });

  it.each([
    [0, 0],
    [640, 0],
    [0, 480],
  ])("reads nothing before the video has a size (%i×%i)", async (width, height) => {
    const { readVideoFrame } = await load();
    await expect(readVideoFrame(video(width, height), newCanvas() as never)).resolves.toEqual([]);
    expect(ponyfill.constructed).toHaveLength(0);
  });
});
