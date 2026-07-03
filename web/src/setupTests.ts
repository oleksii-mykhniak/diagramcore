import '@testing-library/jest-dom/vitest';

// jsdom's File/Blob implementation doesn't provide .text() in this
// environment; App.tsx relies on it (the real browser File API always
// has it), so polyfill it for tests via FileReader.
if (typeof File !== 'undefined' && !File.prototype.text) {
  File.prototype.text = function (this: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
