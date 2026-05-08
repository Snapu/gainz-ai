import { describe, expect, it } from "vitest";
import {
  badgeVariants,
  dropdownMenuItemVariants,
  uiFieldClass,
  uiFieldErrorClass,
  uiPressClass,
  uiSelectableItemClass,
} from "./styles";

describe("uiPressClass", () => {
  it("contains active scale", () => {
    expect(uiPressClass).toContain("active:scale");
  });
});

describe("uiFieldClass", () => {
  it("contains core field styles", () => {
    expect(uiFieldClass).toContain("rounded-xl");
    expect(uiFieldClass).toContain("border");
    expect(uiFieldClass).toContain("focus-visible:ring-primary");
    expect(uiFieldClass).toContain("disabled:opacity-50");
  });
});

describe("uiFieldErrorClass", () => {
  it("contains destructive border", () => {
    expect(uiFieldErrorClass).toContain("border-destructive");
    expect(uiFieldErrorClass).toContain("focus-visible:ring-destructive");
  });
});

describe("uiSelectableItemClass", () => {
  it("contains hover and focus states", () => {
    expect(uiSelectableItemClass).toContain("hover:bg-white");
    expect(uiSelectableItemClass).toContain("active:bg-white");
    expect(uiSelectableItemClass).toContain("focus-visible:ring");
    expect(uiSelectableItemClass).toContain("cursor-pointer");
  });
});

describe("badgeVariants", () => {
  it("default variant includes primary colors", () => {
    const cls = badgeVariants({ variant: "default" });
    expect(cls).toContain("bg-primary");
    expect(cls).toContain("text-primary-foreground");
  });

  it("outline variant includes border", () => {
    const cls = badgeVariants({ variant: "outline" });
    expect(cls).toContain("border");
    expect(cls).toContain("border-border");
  });

  it("secondary variant includes secondary bg", () => {
    const cls = badgeVariants({ variant: "secondary" });
    expect(cls).toContain("bg-secondary");
  });

  it("all variants include base rounded-full class", () => {
    for (const v of ["default", "outline", "secondary", "ghost"] as const) {
      expect(badgeVariants({ variant: v })).toContain("rounded-full");
    }
  });
});

describe("dropdownMenuItemVariants", () => {
  it("default includes focus styles", () => {
    const cls = dropdownMenuItemVariants({});
    expect(cls).toContain("focus:bg-white/10");
    expect(cls).toContain("rounded-xl");
  });

  it("inset:true adds left padding", () => {
    const cls = dropdownMenuItemVariants({ inset: true });
    expect(cls).toContain("pl-8");
  });

  it("inset:false does not add pl-8", () => {
    const cls = dropdownMenuItemVariants({ inset: false });
    expect(cls).not.toContain("pl-8");
  });

  it("includes disabled styles", () => {
    const cls = dropdownMenuItemVariants({});
    expect(cls).toContain("data-[disabled]:opacity-50");
  });
});
