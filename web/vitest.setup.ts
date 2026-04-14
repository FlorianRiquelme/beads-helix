import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Persistent test double so per-test spies/clears stick across re-reads of
// navigator.clipboard (jsdom 25+ exposes it via a getter that returns a fresh
// object on every access, defeating vi.spyOn).
export const clipboardStub = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    get: () => clipboardStub,
  });
}
