import { describe, expect, it } from "vitest";
import { formatAudioLength, parseAudioLength, splitAudioLength } from "@/server/library/audio-length.rules";

describe("parseAudioLength", () => {
  it.each([
    ["12", "30", 750],
    ["12", "", 720],
    ["", "45", 45],
    ["0", "1", 1],
    [" 3 ", " 05 ", 185],
    ["200", "0", 12_000],
    ["", "12000", 12_000],
  ])("turns %j h %j min into %i minutes", (hours, minutes, total) => {
    expect(parseAudioLength(hours, minutes)).toEqual({ minutes: total });
  });

  it("means no length when both parts are empty", () => {
    expect(parseAudioLength("", "")).toEqual({});
    expect(parseAudioLength()).toEqual({});
    expect(parseAudioLength("  ", " ")).toEqual({});
  });

  it.each([
    ["0", "0", "at least 1 minute"],
    ["", "0", "at least 1 minute"],
    ["200", "1", "at most 200 hours"],
    ["201", "", "at most 200 hours"],
    ["", "12001", "at most 200 hours"],
    ["1", "60", "0 to 59"],
    ["1.5", "", "whole hours and minutes"],
    ["-1", "", "whole hours and minutes"],
    ["a", "", "whole hours and minutes"],
    ["", "1e3", "whole hours and minutes"],
    ["999999", "", "whole hours and minutes"],
  ])("rejects %j h %j min", (hours, minutes, message) => {
    expect(parseAudioLength(hours, minutes).error).toContain(message);
  });
});

describe("formatAudioLength", () => {
  it.each([
    [750, "12 h 30 min"],
    [45, "45 min"],
    [180, "3 h"],
    [61, "1 h 1 min"],
    [12_000, "200 h"],
  ])("shows %i minutes as %j", (total, text) => {
    expect(formatAudioLength(total)).toBe(text);
  });
});

describe("splitAudioLength", () => {
  it.each([
    [750, { audioHours: "12", audioMinutes: "30" }],
    [180, { audioHours: "3", audioMinutes: "" }],
    [45, { audioHours: "", audioMinutes: "45" }],
    [null, { audioHours: "", audioMinutes: "" }],
    [undefined, { audioHours: "", audioMinutes: "" }],
  ])("gives the form's text for %s minutes", (total, text) => {
    expect(splitAudioLength(total)).toEqual(text);
  });

  it("round-trips through parseAudioLength", () => {
    for (const total of [1, 45, 59, 60, 61, 180, 750, 12_000]) {
      const { audioHours, audioMinutes } = splitAudioLength(total);
      expect(parseAudioLength(audioHours, audioMinutes)).toEqual({ minutes: total });
    }
  });
});
