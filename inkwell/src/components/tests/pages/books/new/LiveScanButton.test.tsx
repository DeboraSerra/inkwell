import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareReader, readVideoFrame } from "@/components/pages/books/new/barcode-scan";
import { LiveScanButton, useCameraSupported } from "@/components/pages/books/new/LiveScanButton";
import { CAMERA_REFUSED, NO_CAMERA, NOT_A_BOOK, SCANNER_FAILED } from "@/server/books/barcode.rules";
import { expectAccessible } from "../../../a11y";

vi.mock("@/components/pages/books/new/barcode-scan", () => ({ prepareReader: vi.fn(), readVideoFrame: vi.fn() }));

const track = { stop: vi.fn() };
const getUserMedia = vi.fn();
let frames: FrameRequestCallback[] = [];
// Runs the queued animation frames, each a second after the last. Base UI
// queues its own too, which run alongside.
let clock = 0;
const runFrames = async () => {
  const callbacks = frames;
  frames = [];
  clock += 1000;
  await act(async () => {
    for (const callback of callbacks) callback(clock);
  });
};
// Until the scanner has read `count` frames.
const readFrames = (count: number) =>
  waitFor(async () => {
    await runFrames();
    expect(vi.mocked(readVideoFrame).mock.calls.length).toBeGreaterThanOrEqual(count);
  });

const show = () => {
  const props = { onOpenChange: vi.fn(), onIsbn: vi.fn(), onError: vi.fn() };
  const view = render(<LiveScanButton open {...props} />);
  return { ...props, ...view };
};

beforeEach(() => {
  vi.clearAllMocks();
  frames = [];
  getUserMedia.mockResolvedValue({ getTracks: () => [track] });
  vi.mocked(prepareReader).mockResolvedValue(undefined);
  vi.mocked(readVideoFrame).mockResolvedValue([]);
  vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useCameraSupported", () => {
  it("is true only where the browser can open a camera", () => {
    expect(renderHook(() => useCameraSupported()).result.current).toBe(true);
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    expect(renderHook(() => useCameraSupported()).result.current).toBe(false);
  });
});

describe("LiveScanButton", () => {
  it("asks for the rear camera without sound", async () => {
    show();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: "environment" } }, audio: false });
    expect(screen.getByRole("status").textContent).toBe("Hold the barcode inside the frame.");
    await expectAccessible();
  });

  it("hands on a book's ISBN, closing and stopping the camera", async () => {
    vi.mocked(readVideoFrame).mockResolvedValue(["9780441013593"]);
    const { onIsbn, onOpenChange } = show();
    await readFrames(1);
    await waitFor(() => expect(onIsbn).toHaveBeenCalled());
    expect(onIsbn).toHaveBeenCalledWith("9780441013593");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(track.stop).toHaveBeenCalled();
  });

  it("keeps scanning past a product barcode, with a hint", async () => {
    vi.mocked(readVideoFrame).mockResolvedValue(["4006381333931"]);
    const { onIsbn } = show();
    await readFrames(1);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(NOT_A_BOOK));
    await readFrames(2);
    expect(onIsbn).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("skips a frame that can't be read", async () => {
    vi.mocked(readVideoFrame).mockRejectedValueOnce(new Error("frame")).mockResolvedValue(["9780441013593"]);
    const { onIsbn } = show();
    await readFrames(2);
    await waitFor(() => expect(onIsbn).toHaveBeenCalledWith("9780441013593"));
  });

  it.each([
    ["NotAllowedError", CAMERA_REFUSED],
    ["NotFoundError", NO_CAMERA],
  ])("explains a camera that fails with %s", async (name, message) => {
    getUserMedia.mockRejectedValue(Object.assign(new Error("no"), { name }));
    const { onError, onOpenChange } = show();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(message));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("explains a scanner that can't start, and stops the camera", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(prepareReader).mockRejectedValue(new Error("wasm"));
    const { onError } = show();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(SCANNER_FAILED));
    expect(track.stop).toHaveBeenCalled();
  });

  it("stops the camera when closed", async () => {
    const { rerender, onOpenChange, onIsbn, onError } = show();
    await readFrames(1);
    rerender(<LiveScanButton open={false} onOpenChange={onOpenChange} onIsbn={onIsbn} onError={onError} />);
    expect(track.stop).toHaveBeenCalled();
  });

  it("closes on Cancel", async () => {
    const { onOpenChange } = show();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
