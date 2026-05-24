# Lineage 架构说明

> 定位：生成历史的最小持久化单元。  
> 文件：`static/js/locals/Lineage.js` — 数据模型基类

---

## 整体链路

```
  Generator.js          → 创建/追加版本到 lineage
        ↓
  LineageManager.js     → CRUD 领域逻辑（matchOrCreate, addVersion, evictOldest）
        ↓
  Lineage.js            → 数据模型（版本 CRUD, 懒水合, toStripped 脱敏）
        ↓
  StorageManager.js     → 统一存储网关（IDB + localStorage 分路）
        ↓
  IndexedDBRepo.js      → IDB 原子操作（binaries store）
  storage.js            → localStorage 原子操作
```

## 两个关键分离

### 1. 元数据 vs 二进制

| 存储位置 | 内容 |
|----------|------|
| **IDB `app_state` key** | 脱敏 lineage 全量（fingerprint, tabValues, tabsConfig, tabOrder, versions\[].index/type/time/hasBinary, history 摘要） |
| **IDB `binaries/{lineageId}/v{index}`** | 每个版本的二进制（dataUrl, svg, thumbnail） |
| **localStorage** | 仅当前指针（curLineage, curVersion）+ 设定（tabState, apiSettings） |

元数据在写入 IDB 前通过 `Lineage.toStripped()` 自动脱敏，去掉所有二进制字段。  
二进制在 `hydrateVersion()` 时按需从 IDB 拉取并注入内存版本对象。

### 2. Lineage 实例 vs 普通对象

`StorageManager.saveLineages()` 将任意对象包装为 `Lineage` 实例再调用 `toStripped()`。  
但 **`LineageManager.matchOrCreate()` 创建的是普通对象**，不经过 `Lineage` 构造函数。  
这是目前的一个已知不一致（见下方「残留设计」）。

---

## 类结构

```
Lineage
├── fingerprint            string          内容指纹（不含二进制）
├── tabValues              Object          { tabId: value, ... }
├── tabsConfig             Array           setting bar 完整配置
├── tabOrder               Array<string>   tab 排序
├── versions               Array<Version>  版本列表（按序）
│   ├── index              number
│   ├── type               'svg' | 'raster'
│   ├── time               'HH:mm'
│   ├── svg                string          （懒加载）
│   ├── dataUrl            string          （懒加载）
│   └── thumbnail          string          （懒加载）
├── history                摘要（给 HistoryPanel 用）
│   ├── time               'HH:mm'
│   ├── versionCount       number
│   ├── versionActive      number
│   ├── type               'svg' | 'raster'
│   ├── svg                string
│   └── thumbnail          string
│
├── toStripped()           → 脱敏对象
├── fromStripped(data)     ← 从脱敏快照重建
├── addVersion(v)          → index
├── getVersion(index)      → Version | null
├── hydrateVersion(i, fn, lid)  → boolean（懒加载二进制）
├── updateHistory(...)     → void（⚠ 现无调用方）
├── activeVersion          getter
└── versionCount           getter
```

---

## 残留历史设计（审计结论）

以下是在当前代码库中发现的设计残留，建议在未来迭代中处理：

### A. `history.dataUrl` vs `history.thumbnail` 字段不一致

- **Lineage.js** 构造函数的 `history` 默认值含 `thumbnail`，不含 `dataUrl`。
- **Lineage.toStripped()** 输出 `history.thumbnail`。
- **Generator.js** `_onPipelineComplete` 写入 `history.dataUrl`（不是 `thumbnail`）。
- **结果**：Generator 写入的 `dataUrl` 不在脱敏输出中；而 `thumbnail` 字段始终为空，从未被真正使用。

**建议**：统一为一种方案——要么用 `thumbnail` 作为小图摘要，由 Generator 生成真正的缩略图；要么改用 `dataUrl` 并更新 `toStripped()` 输出。当前 `thumbnail` 是未使用的死字段。

### B. `Lineage.updateHistory()` 是死代码

- 该方法定义完整，但 grep 全项目 **零调用**。
- Generator.js 直接通过 `lineage.history = { ... }` 覆写，不调用该方法。

**建议**：要么删除该方法，要么让 Generator.js 改为调用 `updateHistory()` 而非直接赋值。

### C. `HIDDEN_LINEAGE_ID = '__default__'` 无引用

- 位于 `Persistence.js` 第 21 行，标注 `// legacy`。
- 全项目无任何使用者。

**建议**：直接删除。

### D. `LineageManager.matchOrCreate()` 创建普通对象

- 代码：
  ```js
  this.lineages[lineageId] = {
    fingerprint: contentFp,
    versions: [],
    tabValues: ...,
    tabsConfig: ...,
    tabOrder: ...,
    history: { time: '', versionCount: 0, ... }
  };
  ```
- 这绕过了 `Lineage` 类，导致新创建的 lineage 没有 `addVersion()`, `hydrateVersion()`, `getVersion()` 等方法。
- 后续代码（App.js 的 `onSelect`）能调用 `lineage.hydrateVersion()` 仅因为 `StorageManager.saveLineages()` 曾经包装过它（重新加载后）。内存中新创建的 lineage 是普通对象，理论上调用 `hydrateVersion()` 会失败。

**当前能工作的原因**：`matchOrCreate` 之后立即 `addVersion()`（在 `Generator.js` 中），而 `addVersion()` 返回的是 `LineageManager` 的方法（操作普通对象），不使用 `Lineage` 实例方法。

**建议**：让 `matchOrCreate()` 使用 `new Lineage(...)` 统一创建实例。

### E. `fromStripped()` 版本 thumbnail 硬编码为空

```js
const versions = (data.versions || []).map(v => ({
  ...
  dataUrl:   '',
  svg:       '',
  thumbnail: ''    // ← 丢失
}));
```
- 脱敏时 `toStripped()` 不输出二进制（正确），重建时 `thumbnail` 固定为空。
- 缩略图仅能通过后续 `hydrateVersion()` 从 IDB 恢复。
- 这本身不是 bug（因为缩略图确实在二进制里），但 `fromStripped` 的版本对象结构与 `addVersion` 创建的不一致。

**建议**：如果缩略图设计为"仅二进制层存在"，考虑从 `addVersion` 的版本结构中移除 `thumbnail` 字段（仅二进制水合时注入），减少概念混乱。

### F. 旧 LS key 迁移路径

`Persistence.js` 的 `loadAppState()` 包含大量旧格式迁移逻辑：
- `KEYS._old_lineages` → `stroke_lineages`
- `KEYS._old_fingerprints` → `stroke_fingerprints`
- `KEYS._old_history` → `stroke_history`
- `KEYS._old_tabValues` → `stroke_tab_values`

这是**有意保留**的向后兼容逻辑，用于升级用户的数据迁移。不作为"残留设计"处理。

---

## 未来迭代建议优先级

| 优先级 | 条目 | 理由 |
|--------|------|------|
| P1 | A — `history.dataUrl` vs `thumbnail` 不一致 | 可能导致 HistoryPanel 缩略图不显示 |
| P1 | D — `matchOrCreate` 应创建 Lineage 实例 | 类与使用者不一致，容易出 bug |
| P2 | B — 删除或接入 `updateHistory()` | 清理死代码 |
| P2 | C — 删除 `HIDDEN_LINEAGE_ID` | 零引用 dead code |
| P3 | E — 统一版本结构中 `thumbnail` 的定位 | 概念清晰化，非功能问题 |

---

## 典型数据流

```
[生成完成]
    ↓
Generator._onPipelineComplete()
    ├── lineageManager.matchOrCreate(contentFp, initialData)
    ├── lineageManager.addVersion(lineageId, versionData)
    ├── lineageManager.saveVersionBinary(...)     ← IDB binaries/{lid}/v{i}
    ├── lineage.updateHistory(...)                ← 更新摘要（thumbnail 已修复）
    ├── app._rebuildHistoryItems()                 ← HistoryPanel 重建
    └── lineageManager.persistMeta()               ← IDB app_state
              ↓
    StorageManager.saveLineages()
        └── new Lineage(plain).toStripped() → idb.putState()
```