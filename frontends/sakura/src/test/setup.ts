import '@testing-library/jest-dom';

// jsdom does not implement layout, so Element.prototype.scrollIntoView is
// undefined. Components that auto-scroll (e.g. SettingsView.tsx:181 scrolling a
// section into view on a timer) throw "scrollIntoView is not a function" as an
// unhandled error during tests — noise that can mask real failures. Stub it.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
