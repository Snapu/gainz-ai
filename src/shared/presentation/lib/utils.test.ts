import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("preserves text-primary when merging text-micro with font-size classes", () => {
    const merged = cn("text-primary text-[10px]", "text-micro");
    expect(merged).toContain("text-primary");
    expect(merged).toContain("text-micro");
    expect(merged).not.toContain("text-[10px]");
  });
});
