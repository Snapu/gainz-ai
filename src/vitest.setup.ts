import { afterEach, beforeEach, vi } from "vitest";

// Mock Ionic components globally for all tests
vi.mock("@ionic/vue", () => ({
  IonButton: true,
  IonInput: true,
  IonIcon: true,
  IonModal: true,
}));

// Prevent Stencil from trying to define custom elements in jsdom
Object.defineProperty(globalThis, "customElements", {
  value: {
    define: vi.fn(),
    get: vi.fn(),
    whenDefined: vi.fn(),
  },
  writable: true,
  configurable: true,
});

// Mock localStorage as a spyable object
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = value;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    Object.keys(storage).forEach((key) => {
      delete storage[key];
    });
  },
  key: (index: number) => Object.keys(storage)[index] ?? null,
  get length() {
    return Object.keys(storage).length;
  },
};

vi.stubGlobal("localStorage", mockLocalStorage);

beforeEach(() => {
  mockLocalStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  mockLocalStorage.clear();
});
