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

// `PageHeader` measures itself with a ResizeObserver so siblings can offset by
// its real height. jsdom has no layout and therefore no ResizeObserver, so any
// test that renders a workspace page needs this stub — it observes nothing,
// which is the correct behaviour in an environment where nothing resizes.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
