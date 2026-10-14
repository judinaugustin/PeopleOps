import { describe, expect, it } from "vitest";
import { chunkText, lexicalScore } from "@/lib/chunk";
import { canTransitionRequest } from "@/lib/workflows";

describe("chunkText", () => {
  it("normalizes whitespace and keeps source paragraphs", () => {
    expect(chunkText("  First\r\n\r\nSecond\t paragraph ")).toEqual([
      "First\n\nSecond paragraph",
    ]);
  });
  it("splits large text under its configured maximum with overlap", () => {
    const source = "alpha ".repeat(1400);
    const result = chunkText(source, 900, 100);
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((part) => part.length <= 900)).toBe(true);
    expect(result[0].slice(-100)).toBe(result[1].slice(0, 100));
  });
  it("returns no chunks for blank text", () =>
    expect(chunkText(" \n\t ")).toEqual([]));
});

describe("lexicalScore", () => {
  it("scores policy passages from matching content words", () =>
    expect(
      lexicalScore(
        "submit a business expense receipt",
        "Submit expenses through the expense portal with an itemized receipt.",
      ),
    ).toBeGreaterThan(0.5));
  it("does not match unrelated words", () =>
    expect(
      lexicalScore(
        "immigration sponsorship",
        "submit an itemized business expense receipt",
      ),
    ).toBe(0));
});

describe("request state transitions", () => {
  it("allows the documented reviewer transitions", () => {
    expect(canTransitionRequest("submitted", "in_review")).toBe(true);
    expect(canTransitionRequest("in_review", "resolved")).toBe(true);
    expect(canTransitionRequest("resolved", "closed")).toBe(true);
  });
  it("rejects transitions outside the state machine", () => {
    expect(canTransitionRequest("draft", "resolved")).toBe(false);
    expect(canTransitionRequest("closed", "in_review")).toBe(false);
    expect(canTransitionRequest("resolved", "submitted")).toBe(false);
  });
});
