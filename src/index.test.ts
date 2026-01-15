import { describe, it, expect, vi } from "vitest";
import { main } from "./index.js";

describe("main", () => {
  it("should log startup message", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    main();

    expect(warnSpy).toHaveBeenCalledWith("Auto-Remediator starting...");

    warnSpy.mockRestore();
  });
});