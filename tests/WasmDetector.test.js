import { describe, it, expect } from 'vitest';
import { detectWasm } from '../static/js/services/WasmDetector.js';

describe('detectWasm', () => {
  it('should report WASM available when WebAssembly is supported', () => {
    const result = detectWasm();
    // Node.js supports WebAssembly, so available should be true
    expect(result.available).toBe(true);
    expect(result.state).toBe('IDLE');
  });

  it('should report WASM_DISABLED when WebAssembly is undefined', () => {
    const origWasm = globalThis.WebAssembly;
    // @ts-ignore
    delete globalThis.WebAssembly;
    try {
      const result = detectWasm();
      expect(result.available).toBe(false);
      expect(result.state).toBe('WASM_DISABLED');
    } finally {
      globalThis.WebAssembly = origWasm;
    }
  });

  it('should report WASM_DISABLED when WebAssembly.Module constructor fails', () => {
    const origModule = WebAssembly.Module;
    WebAssembly.Module = class {
      constructor() { throw new Error('bogus'); }
    };
    try {
      const result = detectWasm();
      expect(result.available).toBe(false);
      expect(result.state).toBe('WASM_DISABLED');
    } finally {
      WebAssembly.Module = origModule;
    }
  });
});
