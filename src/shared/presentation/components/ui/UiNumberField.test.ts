import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import UiNumberField from "./UiNumberField.vue";

function mountField(initialProps: Record<string, unknown> = {}, initialValue: number | null = 10) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const modelValue = ref<number | null>(initialValue);

  const Host = defineComponent({
    setup() {
      return () =>
        h(UiNumberField, {
          ...initialProps,
          modelValue: modelValue.value,
          "onUpdate:modelValue": (val: number | null | undefined) => {
            modelValue.value = val ?? null;
          },
        });
    },
  });

  const app = createApp(Host);
  app.mount(container);

  return {
    container,
    modelValue,
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

describe("UiNumberField", () => {
  it("renders standard horizontal layout without rounding buttons by default", async () => {
    const { container, unmount } = mountField({ label: "Weight", step: 1 }, 42.5);
    await nextTick();

    try {
      const incrementBtn = container.querySelector('[data-testid="number-field-increment"]');
      const decrementBtn = container.querySelector('[data-testid="number-field-decrement"]');
      const roundDownBtn = container.querySelector('[data-testid="number-field-round-down"]');
      const roundUpBtn = container.querySelector('[data-testid="number-field-round-up"]');

      expect(incrementBtn?.textContent?.trim()).toBe("");
      expect(decrementBtn?.textContent?.trim()).toBe("");
      expect(roundDownBtn).toBeNull();
      expect(roundUpBtn).toBeNull();
    } finally {
      unmount();
    }
  });

  it("renders labeled +step and -step buttons in cross layout", async () => {
    const { container, unmount } = mountField(
      { label: "Weight", layout: "cross", step: 2.5 },
      42.5,
    );
    await nextTick();

    try {
      const incrementBtn = container.querySelector('[data-testid="number-field-increment"]');
      const decrementBtn = container.querySelector('[data-testid="number-field-decrement"]');

      expect(incrementBtn?.textContent?.trim()).toBe("+2.5");
      expect(decrementBtn?.textContent?.trim()).toBe("-2.5");
      expect(incrementBtn?.getAttribute("aria-label")).toBe("Increase by 2.5");
      expect(decrementBtn?.getAttribute("aria-label")).toBe("Decrease by 2.5");
    } finally {
      unmount();
    }
  });

  it("renders contextual round-down and round-up buttons for off-grid values and snaps on click", async () => {
    const { container, modelValue, unmount } = mountField(
      { label: "Weight", layout: "cross", step: 1, min: 0 },
      42.5,
    );
    await nextTick();

    try {
      const roundDownBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="number-field-round-down"]',
      );
      const roundUpBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="number-field-round-up"]',
      );

      expect(roundDownBtn?.textContent?.trim()).toBe("↓42");
      expect(roundUpBtn?.textContent?.trim()).toBe("↑43");

      roundUpBtn?.click();
      await nextTick();
      await nextTick();

      expect(modelValue.value).toBe(43);
      expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("43");
      expect(container.querySelector('[data-testid="number-field-round-down"]')).toBeNull();
      expect(container.querySelector('[data-testid="number-field-round-up"]')).toBeNull();

      modelValue.value = 42.5;
      await nextTick();

      const nextRoundDownBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="number-field-round-down"]',
      );
      nextRoundDownBtn?.click();
      await nextTick();
      await nextTick();

      expect(modelValue.value).toBe(42);
      expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("42");
    } finally {
      unmount();
    }
  });

  it("hides rounding buttons when value is already on the step grid or empty", async () => {
    const onGrid = mountField({ label: "Weight", layout: "cross", step: 2.5 }, 42.5);
    await nextTick();

    try {
      expect(onGrid.container.querySelector('[data-testid="number-field-round-down"]')).toBeNull();
      expect(onGrid.container.querySelector('[data-testid="number-field-round-up"]')).toBeNull();
    } finally {
      onGrid.unmount();
    }

    const empty = mountField({ label: "Weight", layout: "cross", step: 1 }, null);
    await nextTick();

    try {
      expect(empty.container.querySelector('[data-testid="number-field-round-down"]')).toBeNull();
      expect(empty.container.querySelector('[data-testid="number-field-round-up"]')).toBeNull();
    } finally {
      empty.unmount();
    }
  });

  it("handles decimal steps like 0.1 without floating-point drift", async () => {
    const offGrid = mountField({ label: "Distance", layout: "cross", step: 0.1 }, 1.23);
    await nextTick();

    try {
      expect(
        offGrid.container
          .querySelector('[data-testid="number-field-round-down"]')
          ?.textContent?.trim(),
      ).toBe("↓1.2");
      expect(
        offGrid.container
          .querySelector('[data-testid="number-field-round-up"]')
          ?.textContent?.trim(),
      ).toBe("↑1.3");
    } finally {
      offGrid.unmount();
    }

    const onGrid12 = mountField({ label: "Distance", layout: "cross", step: 0.1 }, 1.2);
    await nextTick();
    try {
      expect(
        onGrid12.container.querySelector('[data-testid="number-field-round-down"]'),
      ).toBeNull();
      expect(onGrid12.container.querySelector('[data-testid="number-field-round-up"]')).toBeNull();
    } finally {
      onGrid12.unmount();
    }

    const onGrid03 = mountField({ label: "Distance", layout: "cross", step: 0.1 }, 0.3);
    await nextTick();
    try {
      expect(
        onGrid03.container.querySelector('[data-testid="number-field-round-down"]'),
      ).toBeNull();
      expect(onGrid03.container.querySelector('[data-testid="number-field-round-up"]')).toBeNull();
    } finally {
      onGrid03.unmount();
    }
  });

  it("clamps round-down target at min=0 without producing negative values", async () => {
    const { container, modelValue, unmount } = mountField(
      { label: "Weight", layout: "cross", step: 1, min: 0 },
      0.5,
    );
    await nextTick();

    try {
      const roundDownBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="number-field-round-down"]',
      );
      const roundUpBtn = container.querySelector<HTMLButtonElement>(
        '[data-testid="number-field-round-up"]',
      );

      expect(roundDownBtn?.textContent?.trim()).toBe("↓0");
      expect(roundUpBtn?.textContent?.trim()).toBe("↑1");

      roundDownBtn?.click();
      await nextTick();
      expect(modelValue.value).toBe(0);
    } finally {
      unmount();
    }
  });

  it("suppresses inverted rounding buttons when value is outside [min, max]", async () => {
    const belowMin = mountField({ label: "Weight", layout: "cross", step: 1, min: 5 }, 4.2);
    await nextTick();
    try {
      expect(
        belowMin.container.querySelector('[data-testid="number-field-round-down"]'),
      ).toBeNull();
      expect(
        belowMin.container
          .querySelector('[data-testid="number-field-round-up"]')
          ?.textContent?.trim(),
      ).toBe("↑5");
    } finally {
      belowMin.unmount();
    }

    const aboveMax = mountField({ label: "Weight", layout: "cross", step: 1, max: 10 }, 10.5);
    await nextTick();
    try {
      expect(
        aboveMax.container
          .querySelector('[data-testid="number-field-round-down"]')
          ?.textContent?.trim(),
      ).toBe("↓10");
      expect(aboveMax.container.querySelector('[data-testid="number-field-round-up"]')).toBeNull();
    } finally {
      aboveMax.unmount();
    }
  });

  it("hides rounding buttons when showRounding is false", async () => {
    const { container, unmount } = mountField(
      { label: "Reps", layout: "cross", step: 1, showRounding: false },
      8.5,
    );
    await nextTick();

    try {
      expect(container.querySelector('[data-testid="number-field-round-down"]')).toBeNull();
      expect(container.querySelector('[data-testid="number-field-round-up"]')).toBeNull();
    } finally {
      unmount();
    }
  });
});
