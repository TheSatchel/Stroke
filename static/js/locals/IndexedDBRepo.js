/**
 * IndexedDBRepo.js — IndexedDB 封装层
 *
 * 职责：
 *   - 存储所有二进制大对象：全尺寸 base64、缩略图、SVG 源码
 *   - 数据库：stroke-app，对象存储：binaries
 *   - 键格式：{lineageId}/v{versionIndex}
 *
 * 不对 localStorage 做任何读写。
 */

const DB_NAME = 'stroke-app';
const DB_VERSION = 2; // bumped for app_state key
const STORE_NAME = 'binaries';
const LINEAGES_KEY = 'app_state';

/** @typedef {{ dataUrl: string, thumbnail: string, svg: string }} BinaryEntry */

let _db = null;

/**
 * 获取数据库实例（懒初始化 + 自动升级）
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      _db = request.result;
      resolve(_db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('[IndexedDBRepo] 数据库升级被阻塞');
  });
}

/**
 * 构造存储键
 * @param {string} lineageId
 * @param {number} versionIndex
 * @returns {string}
 */
function makeKey(lineageId, versionIndex) {
  return `${lineageId}/v${versionIndex}`;
}

// ================================================================
//  公开 API
// ================================================================

/**
 * 写入一条二进制记录
 * @param {string} lineageId
 * @param {number} versionIndex
 * @param {BinaryEntry} entry
 * @returns {Promise<void>}
 */
export async function putBinary(lineageId, versionIndex, entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = makeKey(lineageId, versionIndex);
    const request = store.put(entry, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 读取一条二进制记录
 * @param {string} lineageId
 * @param {number} versionIndex
 * @returns {Promise<BinaryEntry|undefined>}
 */
export async function getBinary(lineageId, versionIndex) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const key = makeKey(lineageId, versionIndex);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除指定 lineage 的所有二进制记录
 * @param {string} lineageId
 * @returns {Promise<void>}
 */
export async function deleteLineageBinaries(lineageId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const prefix = `${lineageId}/v`;
    // 使用游标遍历删除所有匹配的键
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const request = store.delete(range);  // delete over a range works in modern browsers
    request.onsuccess = () => resolve();
    request.onerror = () => {
      // Fallback: 游标删除
      const cursorReq = store.openCursor(range);
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          store.delete(cursor.key);
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    };
  });
}

/**
 * 删除单条二进制记录
 * @param {string} lineageId
 * @param {number} versionIndex
 * @returns {Promise<void>}
 */
export async function deleteBinary(lineageId, versionIndex) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = makeKey(lineageId, versionIndex);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 清空所有二进制数据
 * @returns {Promise<void>}
 */
export async function clearAllBinaries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 估算 IndexedDB 使用量（如果 Storage API 可用）
 * @returns {Promise<{ usage: number, quota: number }|null>}
 */
export async function putState(lineages) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(lineages, LINEAGES_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 读取全量 lineage 状态
 * @returns {Promise<Object|null>}
 */
export async function getState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(LINEAGES_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 删除全量 lineage 状态
 * @returns {Promise<void>}
 */
export async function deleteState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(LINEAGES_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function estimateStorage() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      return await navigator.storage.estimate();
    } catch (e) {
      console.warn('[IndexedDBRepo] 存储估算失败:', e);
      return null;
    }
  }
  return null;
}