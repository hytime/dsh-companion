import '@testing-library/jest-dom/vitest';

// Radix/floating-ui 在 jsdom 中需要 ResizeObserver 与 scrollIntoView。
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof window !== 'undefined') {
  if (window.ResizeObserver === undefined) {
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverStub,
    });
  }
  if (typeof window.HTMLElement.prototype.scrollIntoView !== 'function') {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
}
