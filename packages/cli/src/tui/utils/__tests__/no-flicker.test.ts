import { afterEach, describe, expect, it, vi } from "vitest";
import { getNoFlickerConfig } from "../no-flicker.js";

vi.mock("node:fs", () => ({ existsSync: () => false }));
afterEach(() => vi.unstubAllEnvs());

describe("mouse configuration", () => {
  it("defaults to full mouse independently of synchronized-output mode", () => {
    vi.stubEnv("VELLUM_DISABLE_MOUSE", undefined);
    vi.stubEnv("VELLUM_DISABLE_MOUSE_CLICKS", undefined);
    vi.stubEnv("VELLUM_NO_FLICKER", "0");
    expect(getNoFlickerConfig()).toMatchObject({ synchronizedOutput: false, mouseMode: "full" });
    vi.stubEnv("VELLUM_NO_FLICKER", "1");
    expect(getNoFlickerConfig()).toMatchObject({ synchronizedOutput: true, mouseMode: "full" });
  });

  it("retains explicit wheel-only and disabled configuration", () => {
    vi.stubEnv("VELLUM_DISABLE_MOUSE", "0");
    vi.stubEnv("VELLUM_DISABLE_MOUSE_CLICKS", "1");
    expect(getNoFlickerConfig().mouseMode).toBe("wheel-only");
    vi.stubEnv("VELLUM_DISABLE_MOUSE", "1");
    expect(getNoFlickerConfig().mouseMode).toBe("disabled");
  });
});
