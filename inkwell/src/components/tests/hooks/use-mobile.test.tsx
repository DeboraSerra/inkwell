import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "@/hooks/use-mobile";

const setWidth = (width: number) => {
  Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: width });
};

afterEach(() => {
  vi.unstubAllGlobals();
  setWidth(1024);
});

describe("useIsMobile", () => {
  it.each([
    [767, true],
    [768, false],
  ])("is %s px wide a phone? %s", (width, mobile) => {
    setWidth(width);
    expect(renderHook(() => useIsMobile()).result.current).toBe(mobile);
  });

  it("follows the window as it resizes past the breakpoint, and stops listening when unmounted", () => {
    let onChange = () => {};
    const removeEventListener = vi.fn();
    const matchMedia = vi.fn(() => ({
      addEventListener: (_type: string, listener: () => void) => {
        onChange = listener;
      },
      removeEventListener,
    }));
    vi.stubGlobal("matchMedia", matchMedia);
    setWidth(1024);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    expect(result.current).toBe(false);
    setWidth(400);
    act(() => onChange());
    expect(result.current).toBe(true);
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", onChange);
  });
});
