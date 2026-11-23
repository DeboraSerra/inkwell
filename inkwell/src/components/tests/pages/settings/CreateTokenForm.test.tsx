import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateTokenForm from "@/components/pages/settings/CreateTokenForm";
import { toast } from "@/components/ui/toast";
import { createApiToken } from "@/server/auth/auth.controller";
import { expectAccessible } from "../../a11y";

vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/server/auth/auth.controller", () => ({ createApiToken: vi.fn() }));

const create = async (name: string) => {
  render(<CreateTokenForm />);
  await userEvent.type(screen.getByLabelText("Token name"), name);
  await userEvent.click(screen.getByRole("button", { name: "Create token" }));
};
const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createApiToken).mockResolvedValue({ token: "ink_secret" });
  vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (Macintosh)", clipboard: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CreateTokenForm", () => {
  it("creates a token with the typed name and shows it once", async () => {
    await create("Laptop");
    expect(await screen.findByText("ink_secret")).toBeTruthy();
    expect((vi.mocked(createApiToken).mock.calls[0][1] as FormData).get("name")).toBe("Laptop");
    expect(screen.getByText(/won't be able to see it again/)).toBeTruthy();
    await expectAccessible();
  });

  it("shows why a token couldn't be created", async () => {
    vi.mocked(createApiToken).mockResolvedValue({ error: "Give the token a name (up to 100 characters)." });
    await create("x");
    expect(await screen.findByText("Give the token a name (up to 100 characters).")).toBeTruthy();
    expect(screen.queryByText("ink_secret")).toBeNull();
    await expectAccessible();
  });

  it("copies the token, says so, then offers to copy again", async () => {
    await create("Laptop");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await act(async () => screen.getByRole("button", { name: "Copy token" }).click());
    expect(writeText).toHaveBeenCalledWith("ink_secret");
    expect(toast.add).toHaveBeenCalledWith({ description: "Token copied." });
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Copy token" })).toBeTruthy();
  });

  it("selects the token for copying by hand where the clipboard isn't allowed", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await create("Laptop");
    await userEvent.click(await screen.findByRole("button", { name: "Copy token" }));
    expect(await screen.findByText("The token is selected. Press ⌘C to copy it.")).toBeTruthy();
    expect(globalThis.getSelection()?.toString()).toBe("ink_secret");
  });

  it("names Ctrl+C off a Mac, with no clipboard at all", async () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (Windows NT 10.0)", clipboard: undefined });
    await create("Laptop");
    await userEvent.click(await screen.findByRole("button", { name: "Copy token" }));
    expect(await screen.findByText("The token is selected. Press Ctrl+C to copy it.")).toBeTruthy();
  });

  it("says it's creating while it waits", async () => {
    let finish: (value: { token: string }) => void = () => {};
    vi.mocked(createApiToken).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await create("Laptop");
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeTruthy();
    await act(async () => finish({ token: "ink_new" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create token" })).toBeTruthy());
  });
});
