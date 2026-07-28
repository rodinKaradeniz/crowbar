import "@testing-library/jest-dom/vitest";

// Radix Select relies on pointer-capture APIs that jsdom does not implement.
Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { value: () => false },
  setPointerCapture: { value: () => undefined },
  releasePointerCapture: { value: () => undefined },
});

Object.defineProperty(Element.prototype, "scrollIntoView", {
  value: () => undefined,
});
