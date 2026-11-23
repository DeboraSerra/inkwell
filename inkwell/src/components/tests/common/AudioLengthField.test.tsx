import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AudioLengthField } from "@/components/common/AudioLengthField";
import { expectAccessible } from "../a11y";

const submitWith = async (hours: string, minutes: string) => {
  let sent: FormData | undefined;
  render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sent = new FormData(event.currentTarget);
      }}
    >
      <AudioLengthField />
    </form>,
  );
  if (hours) await userEvent.type(screen.getByLabelText("Hours"), hours);
  if (minutes) await userEvent.type(screen.getByLabelText("Minutes"), minutes);
  fireEvent.submit(screen.getByLabelText("Hours").closest("form") as HTMLFormElement);
  return [sent?.get("audioHours"), sent?.get("audioMinutes")];
};

describe("AudioLengthField", () => {
  it("starts from the saved length", async () => {
    render(<AudioLengthField values={{ audioHours: "11", audioMinutes: "5" }} />);
    expect((screen.getByLabelText("Hours") as HTMLInputElement).value).toBe("11");
    expect((screen.getByLabelText("Minutes") as HTMLInputElement).value).toBe("5");
    await expectAccessible();
  });

  it("sends both parts as typed", async () => {
    expect(await submitWith("11", "5")).toEqual(["11", "5"]);
  });

  it("fills an empty minutes part with 0", async () => {
    expect(await submitWith("11", "")).toEqual(["11", "0"]);
  });

  it("fills an empty hours part with 0", async () => {
    expect(await submitWith("", "45")).toEqual(["0", "45"]);
  });

  it("leaves both empty for no length", async () => {
    expect(await submitWith("", "")).toEqual(["", ""]);
  });
});
