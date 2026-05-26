/**
 * WasmDetector.js — WASM 可用性检测
 *
 * 纯函数，返回检测结果，无副作用。
 *
 * @returns {{ available: boolean, state: string }}
 */
export function detectWasm() {
  try {
    if (typeof WebAssembly === 'undefined') {
      return { available: false, state: 'WASM_DISABLED' };
    }
    const mod = new WebAssembly.Module(
      Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
    );
    const available = (mod instanceof WebAssembly.Module);
    return { available, state: available ? 'IDLE' : 'WASM_DISABLED' };
  } catch (e) {
    return { available: false, state: 'WASM_DISABLED' };
  }
}
