import { vi } from "vitest";

// Mock Ionic components globally for all tests
vi.mock("@ionic/vue", () => ({
  IonButton: true,
  IonInput: true,
  IonIcon: true,
  IonModal: true,
}));

// Prevent Stencil from trying to define custom elements in jsdom
global.customElements = {
  ...global.customElements,
  define: vi.fn(),
  get: vi.fn(),
  whenDefined: vi.fn(),
};
