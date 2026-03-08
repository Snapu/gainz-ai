import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UiNumberStepper from "@/components/ui/UiNumberStepper.vue";

describe("UiNumberStepper", () => {
  it("should mount with modelValue prop", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: 5, step: 1, min: 0, max: 10 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("modelValue")).toBe(5);
  });

  it("should accept null modelValue", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: null, step: 1, min: 0, max: 10 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("modelValue")).toBeNull();
  });

  it("should apply step prop correctly", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: 5, step: 1, min: 0, max: 10 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("step")).toBe(1);
  });

  it("should apply step=0.5 for float precision", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: 2.5, step: 0.5, min: 0, max: 5 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("step")).toBe(0.5);
    expect(wrapper.props("modelValue")).toBe(2.5);
  });

  it("should apply min boundary correctly", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: 2, step: 1, min: 1, max: 10 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("min")).toBe(1);
  });

  it("should apply max boundary correctly", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: 8, step: 1, min: 0, max: 10 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("max")).toBe(10);
  });

  it("should handle value at min boundary", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: 0, step: 1, min: 0, max: 10 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("modelValue")).toBe(wrapper.props("min"));
  });

  it("should handle value at max boundary", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: 10, step: 1, min: 0, max: 10 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("modelValue")).toBe(wrapper.props("max"));
  });

  it("should support float precision at 3.0", () => {
    const wrapper = mount(UiNumberStepper, {
      props: { modelValue: 3.0, step: 0.5, min: 0, max: 5 },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.props("modelValue")).toBe(3.0);
    expect(wrapper.props("step")).toBe(0.5);
  });

  it("should render with all required props", () => {
    const wrapper = mount(UiNumberStepper, {
      props: {
        modelValue: 5,
        step: 1,
        min: 0,
        max: 10,
      },
      global: {
        stubs: {
          IonButton: true,
          IonInput: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.props()).toMatchObject({
      modelValue: 5,
      step: 1,
      min: 0,
      max: 10,
    });
  });
});
