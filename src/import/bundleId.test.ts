import { describe, expect, it } from "vitest";
import { bundleId } from "./bundleId.js";

describe("bundleId", () => {
  it("uses the bare msgid when there is no context", () => {
    expect(bundleId(undefined, "greeting")).toBe("greeting");
    expect(bundleId("", "greeting")).toBe("greeting");
  });

  it("folds msgctxt into the id with the :: delimiter", () => {
    expect(bundleId("menu", "Open")).toBe("menu::Open");
  });

  it("keeps contexts distinct for identical msgids", () => {
    expect(bundleId("noun", "Post")).not.toBe(bundleId("verb", "Post"));
  });
});
