# Continue Guide — Stroke UI System (AI Image Generation Workbench)

## 1. Project Overview

**Stroke** is an AI image generation workbench built as a single-page application (SPA) with a FastAPI backend. It provides a flexible, drag-and-drop pipeline interface where users chain multiple image generation calls together — each configurable with different AI provider settings — and pass results from one call as reference images to downstream calls.

### Key Technologies

| Layer | Technology |
|-------|-----------|
| Backend | Python 3, FastAPI, `a2wsgi` + `waitress` (WSGI), `uvicorn` (ASGI) |
| Frontend | Vanilla JavaScript (ES modules, no framework), HTML5, CSS3 |
| Storage | localStorage (client-side only — no server-side persistence) |
| Architecture | Adapter pattern for AI providers, Widget system for UI components |
| Deployment | Single Python process, configurable via `settings.yaml` and CLI flags |
| PWA | Service Worker (`sw.js`), manifest, offline support |

### High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser (SPA)                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ History   │  │ Canvas   │  │ Config Panel     │   │
│  │ Panel     │  │ (SVG/Png)│  │ (drag-sections)  │   │
│  │ (left)    │  │ (center) │  │ (right)          │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│                     │                                │
│            ┌────────┴────────┐                       │
│            │  Generator.js    │  (pipeline coords)   │
│            │  adapter.js      │  (registry)          │
│            │  XianyuAdapter   │  (provider impl)     │
│            └─────────────────┘                       │
│                     │                                │
│                     ▼                                │
│            External AI APIs                          │
│            (allgpt, OpenAI, etc.)                    │
└──────────────────────────────────────────────────────┘
```

---

## 2. Getting Started

### Prerequisites

- **Python 3.9+** (for backend)
- **pip** (Python package manager)
- A modern browser (Chrome/Firefox/Edge — no IE support)
- Optional: `node`/`npm` for linting (project doesn't use a build step)

### Installation

```powershell
# Clone and enter the project
cd GPT-IMAGE-2-CLIENT

# (Optional but recommended) Create a virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

### Running the Server

```powershell
# Default: ASGI mode with uvicorn (cross-platform)
python serve.py

# ASGI with auto-reload (single worker, for development)
python serve.py --debug

# WSGI mode (Windows production, uses waitress)
python serve.py --wsgi

# Specify host/port in settings.yaml:
#   server:
#     host: 0.0.0.0
#     port: 8000
#     workers: 4
```

Then open **http://localhost:8000** in your browser.

### Running Tests

The project does not currently have a test suite. All front-end code is tested manually via browser DevTools. The console logs are verbose and help with debugging.

### Basic Usage

1. **Add API configurations** — Click the settings gear (⚙) to open Settings → "管理配置" to define API keys and model preferences. Each config can target a different adapter (e.g., `xianyu`).

2. **Set up the pipeline** — The right panel contains drag-section widgets (e.g., prompt, image upload). Drag sections to reorder. Each "generate_call" section defines a generation step.

3. **Click "生成"** — The generation button triggers the pipeline. Each `generate_call` section processes its segments in sequence, passing output images downstream.

4. **Use the canvas** — Generated SVG images appear in the center canvas. Results also display as thumbnails in each `generate_call` section.

5. **Track versions** — The left history panel maintains version lineages. Click any version to restore it. Use the right-arrow buttons to navigate versions.

---

## 3. Project Structure

```
GPT-IMAGE-2-CLIENT/
├── app/                          # FastAPI application factory
│   └── __init__.py               # create_app() — mounts static, template routes
├── static/                       # Frontend (browser-served)
│   ├── js/
│   │   ├── main.js               # Entry point: PWA registration + App init
│   │   ├── ui.js                 # Alias for main.js
│   │   ├── pwa.js                # Service Worker registration
│   │   ├── storage.js            # localStorage CRUD for configs
│   │   ├── segmentparser.js      # Splits pipeline into generation segments
│   │   ├── adapter.js            # GeneratorService registry (adapter.js)
│   │   ├── adapters/
│   │   │   ├── BaseAdapters.js   # Abstract base: config mgmt, _cleanToImage(), isValidSvg()
│   │   │   ├── XianyuAdapter.js  # Concrete: allgpt API with fallback
│   │   │   └── ResponseParser.js # SVG ↔ base64 encoding helpers
│   │   ├── components/
│   │   │   ├── utils.js          # el() helper (DOM element factory)
│   │   │   ├── Canvas.js         # SVG canvas: rendering, zoom, pan, lasso
│   │   │   ├── ConfigTabs.js     # Default tab definitions + widget registry
│   │   │   ├── ConfigPanel.js    # Right panel: drag sections container
│   │   │   ├── ConfigModal.js    # Modal: manage API configs (CRUD)
│   │   │   ├── HistoryPanel.js   # Left panel: version history + filtering
│   │   │   ├── SettingsModal.js  # Settings: theme, accent, danger zone
│   │   │   └── widgets/
│   │   │       ├── TextWidget.js           # Single/multi-line text input
│   │   │       ├── ChoiceWidget.js         # Radio/button group selector
│   │   │       ├── SliderWidget.js         # Range slider with labels
│   │   │       ├── ImageWidget.js          # Image upload (drag-drop / paste)
│   │   │       ├── AbstractImageWidget.js  # Base class for image widgets
│   │   │       └── GenerateCallWidget.js   # ⭐ Generation trigger + result preview
│   │   └── uis/
│   │       ├── App.js            # Root coordinator: wires events, manages state
│   │       ├── Generator.js      # performGeneration() — pipeline executor
│   │       ├── fingerprint.js    # Fingerprint-based lineage matching
│   │       └── persistence.js    # localStorage load/save app state
│   ├── css/
│   │   └── workspace.css         # All UI styles (dark/light via CSS variables)
│   ├── img/                      # PWA icons (192x192, 512x512)
│   └── sw.js                     # Service Worker (cache strategy)
├── templates/
│   └── index.html                # Shell HTML: Jinja2 template with CSS vars
├── serve.py                      # Production server entry (ASGI/WSGI)
├── serve.bat                     # Windows convenience launcher
├── settings.yaml                 # Server config (host, port, workers)
├── requirements.txt              # Python dependencies
└── README.md                     # User-facing project readme
```

### Key Files and Their Roles

| File | Role | Critical? |
|------|------|-----------|
| `App.js` | Root UI coordinator — creates all panels, wires events, loads state | ✅ |
| `Generator.js` | Pipeline executor — iterates segments, calls adapter, merges images | ✅ |
| `adapter.js` | Generator registry — registers adapters, switches active config | ✅ |
| `segmentparser.js` | Splits config pipeline into segments at each `generate_call` | ✅ |
| `GenerateCallWidget.js` | Most complex widget — config selector, params, upload, result preview | ✅ |
| `XianyuAdapter.js` | Concrete adapter — handles HTTP calls to allgpt with fallback logic | ✅ |
| `BaseAdapters.js` | Abstract base — shared logic for parsing AI responses (SVG/raster) | ✅ |
| `ResponseParser.js` | SVG ↔ base64 Data URL encoding utilities | - |
| `persistence.js` | Saves/loads app state to/from localStorage | ✅ |
| `storage.js` | CRUD for API configurations in localStorage | - |
| `ConfigPanel.js` | Drag-and-drop sections container (right panel) | ✅ |
| `ConfigTabs.js` | Default tab definitions + widget type registry | - |
| `Canvas.js` | SVG rendering canvas with zoom, pan, lasso selection | ✅ |
| `HistoryPanel.js` | Version lineage display with filtering (left panel) | - |
| `SettingsModal.js` | Theme, accent, danger zone, config management entry | - |
| `workspace.css` | All styles — uses CSS custom properties for theming | - |
| `index.html` | HTML shell with inline critical CSS (prevents FOUC) | ✅ |
| `serve.py` | Production server entry point with CLI | - |

---

## 4. Development Workflow

### Coding Conventions

- **Languages**: JavaScript (frontend), Python 3 (backend)
- **Frontend**: Vanilla JS ES modules — **no bundler, no framework, no TypeScript**
- **DOM Creation**: Use the `el()` helper from `components/utils.js` instead of raw `document.createElement()`
- **Comments**: JSDoc-style comments for all public methods. Chinese comments for inline explanations are acceptable.
- **CSS**: All styles in `workspace.css` using CSS custom properties (never inline colors). Theme color variables are injected at runtime from user settings.
- **Python**: Standard PEP 8. Backend is minimal (serves static files only).

### How the Pipeline Works

The pipeline is the core concept. Here's the flow:

1. **User configures tabs** (drag-sections in right panel): prompt text, image uploads, sliders, etc.
2. **User clicks "生成"** → `performGeneration()` in `Generator.js` is called
3. **Segment Parser** (`segmentparser.js`) splits the tab configuration at each `generate_call` tab
4. **For each segment**:
   - Collects prompt text from all tabs between this `generate_call` and the previous one
   - Collects images from `image` type tabs in that range
   - Gets the `configId` from the `generate_call` widget (which determines adapter + API key + model)
   - Passes any dynamic parameter overrides from the `generate_call` widget's collapsible params area
   - Switches the `GeneratorService` to the correct adapter/config
   - Calls `adapter.generate()` with the prompt + image list
   - **Merges the output** as a reference image for the *next* segment
5. **Result**: The last segment's output becomes the display result
6. **Persistence**: Results are saved to localStorage with version lineage tracking

### Debugging Tips

- **Verbose console logging**: The app logs heavily to the console. Open DevTools (F12) and watch the Console tab.
- **Key log prefixes**:
  - `[Generator]` — adapter switching and segment processing
  - `[segmentparser]` — image collection and segment boundaries
  - `[Xianyu]` — HTTP request/response details
  - `[uis]` — UI errors
- **Expose app globally**: `window.__strokeApp` provides runtime access to the App instance for inspection
- **Check localStorage**: In DevTools → Application → Local Storage → your domain. You'll see keys like `stroke_configs`, `stroke_app_state`, `stroke_gcall_configs`, `stroke_theme_*`

### Adding a New AI Provider (Adapter)

1. Create a new class extending `BaseAdapters` (see `adapters/XianyuAdapter.js` as template)
2. Define static `id`, `label`, `defaultModel`, `models`, and `configParams` getters
3. Implement `async generate({ prompt, imageBase64List })` — must return an `ImageResult` object: `{ type: 'svg', svg }` or `{ type: 'raster', dataUrl }`
4. Import and register it in the `BUILTIN` array in `adapter.js`

```javascript
// Example: adapters/YourAdapter.js
import { BaseAdapters } from './BaseAdapters.js';

export class YourAdapter extends BaseAdapters {
  static get id() { return 'your-provider'; }
  static get label() { return 'Your Provider Name'; }
  static get defaultModel() { return 'model-id'; }
  static get models() { return [{ id: 'model-id', label: 'Model Name' }]; }

  static get configParams() {
    return [
      { name: 'temperature', label: 'Temperature', type: 'slider', defaultValue: 0.7, min: 0, max: 2, step: 0.1 }
    ];
  }

  async generate({ prompt, imageBase64List }) {
    // ... make HTTP request to your API ...
    // Return { type: 'svg', svg } or { type: 'raster', dataUrl }
  }
}

// In adapter.js, add:
import { YourAdapter } from './adapters/YourAdapter.js';
const BUILTIN = [XianyuAdapter, YourAdapter];
```

### Adding a New Widget Type

1. Implement a widget class in `components/widgets/` with `getValue()`, `setValue(v)`, and `onChange(fn)` methods
2. Register it in `ConfigTabs.js`'s `widgetRegistry`:
   ```javascript
   import YourWidget from './widgets/YourWidget.js';
   widgetRegistry['your_type'] = YourWidget;
   ```
3. Add default tab definitions in `defaultConfigTabs` if needed

### Theme Customization

The app supports per-user theme customization stored in localStorage:
- **Accent color** (`stroke_theme_accent`): Hex color, converted to HSL for CSS variables
- **Mode** (`stroke_theme_mode`): `'light'`, `'dark'`, or `'system'`
- CSS variables are injected dynamically via `SettingsModal.js` → `applyFullScheme()`
- Never hardcode colors in components — always use `var(--color-*)` variables

---

## 5. Key Concepts

### Core Abstractions

**Adapter** — A class that wraps an external AI image generation API. Each adapter handles:
- Building HTTP requests (endpoint, headers, payload)
- Parsing responses (SVG strings, raster data URLs)
- Fallback logic (e.g., `bad_response_status_code` → try backup model)
- Config parameters (temperature, top_p, group, etc.)

**Widget** — A UI component rendered inside the ConfigPanel's drag sections. Each widget type handles one input type (text, slider, image, choice, generate_call) and provides `getValue()` / `setValue()` to the pipeline.

**Segment** — A slice of the pipeline between two `generate_call` tabs (or start/first-call, or last-call/end). Each segment gets its own prompt (concatenated from tab values), its own reference images, and its own adapter config.

**Lineage** — A version tree that tracks all generations derived from the same input configuration (fingerprint). The left History Panel shows lineages with version navigation.

**GenerateCallWidget** — The most complex widget. It's both a pipeline trigger point AND a result preview container. It contains:
- A config selector dropdown (which API key/model to use)
- A collapsible "参数微调" (parameter override) area
- A status indicator (ready/generating/done)
- A result image preview thumbnail
- A clear (X) button

### Segment Merging Logic (Critical)

When executing the pipeline (`Generator.js`), for each segment:
1. Collect images from `image` type widgets in the segment's range
2. If a **previous segment produced a result**, add it to the current segment's image list (unless it's already there)
3. This means downstream `generate_call` steps automatically get upstream results as reference images

### Fingerprint System

Input configurations are fingerprinted using a djb2 hash of JSON-serialized widget values. This allows the system to:
- Match new generations to existing lineages (same config = same lineage)
- Track version history within a lineage
- Detect when a configuration has changed enough to warrant a new lineage

### Fallback Mechanism

The `XianyuAdapter` implements a two-tier fallback:
1. **Primary model** fails with `bad_response_status_code` → automatically retry with `fallbackModel` (configured in Settings)
2. **Network errors** also trigger fallback
3. **Failures after fallback** are thrown as errors (no infinite loops)

---

## 6. Common Tasks

### Adding a New Segment (Generation Step)

In the browser:
1. Click "添加段" (add section) in the ConfigPanel
2. Choose the section type (e.g., `generate_call`)
3. The new section appears as a draggable panel in the right sidebar
4. Select a configuration from the dropdown
5. Optionally tweak parameters in the collapsible "参数微调" area
6. When you click "生成", the new segment will be processed in sequence

### Modifying the Default Pipeline Layout

Edit `static/js/components/ConfigTabs.js` — the `defaultConfigTabs` array defines the initial tab layout. Each entry specifies:
- `id`: unique identifier
- `type`: widget type (`text`, `image`, `slider`, `choice`, `generate_call`)
- `title`: display name in the drag-section header
- `describe`: description shown below the title
- `defaultValue`: initial value
- `promptFormat`: how the value appears in the prompt (e.g., `'{value}'`)
- `order`: tab ordering

### Inspecting Runtime State

Open Browser DevTools and run:
```javascript
// Full app state
window.__strokeApp

// Current generator config
window.__strokeApp.generator.activeConfig

// All API configurations
JSON.parse(localStorage.getItem('stroke_configs'))

// App state (history, lineages)
JSON.parse(localStorage.getItem('stroke_app_state'))
```

### Clearing All Data

Via the UI: Settings (⚙) → Danger Zone → "删除所有历史"
Or programmatically:
```javascript
localStorage.removeItem('stroke_configs');
localStorage.removeItem('stroke_app_state');
localStorage.removeItem('stroke_gcall_configs');
```

### Adding a New Python Dependency

1. Add the package to `requirements.txt`
2. Run `pip install -r requirements.txt`
3. The `app/__init__.py` is where you'd hook in new routes or middleware

---

## 7. Troubleshooting

### "API 请求失败，状态码: 4xx/5xx"

Check:
1. **API key validity** — Verify in Settings → 管理配置 that the API key is correct
2. **Endpoint URL** — Ensure no trailing slashes, correct protocol (https)
3. **Model availability** — Some models may be restricted by region or billing tier
4. **Console > Network tab** — Inspect the actual HTTP request/response

### "JSON 解析失败" or "不是有效 SVG"

The API returned a response that couldn't be parsed as SVG or raster data. Check:
- Console logs for the raw response text
- The `_cleanToImage()` method in `BaseAdapters.js` handles several response formats:
  - Direct `data:image/...` URLs
  - Markdown image syntax (`![...](...)`)
  - Code-fenced SVG
  - Raw SVG strings
- If a new response format is needed, extend `_cleanToImage()`

### Images Not Passing Between Segments

Check the console for:
```
[Generator] 段N 最终图片数: X (本地Y + 上游Z)
```
If `Z=0` when you expect it to be 1:
- Verify the upstream `generate_call` actually produced a result (check its preview thumbnail)
- The upstream result must be a non-empty base64 string
- `svgToBase64DataUrl()` in `ResponseParser.js` may fail for malformed SVGs

### Generate Button Not Working

Common causes:
- JavaScript errors in console (check for red error messages)
- Missing API configuration (no config selected in a `generate_call` widget's dropdown)
- Adapter not registered (check `BUILTIN` in `adapter.js`)
- The `_configId` in a `GenerateCallWidget` might be null (shows "— 无配置 —")

### Dark/Light Theme Flicker

The inline `<script>` in `index.html` applies theme CSS variables *before* the page renders to prevent FOUC. If you see flicker:
- Ensure the inline script runs synchronously (no `async`/`defer`)
- Check that `workspace.css` doesn't override `:root` CSS variables

### PWA Not Updating

- The Service Worker (`sw.js`) implements a cache-first strategy
- During development, use DevTools → Application → Service Workers → "Update on reload" checkbox
- Or unregister the service worker: `navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()))`

---

## 8. References

### Project Files Reference

| Component | Source |
|-----------|--------|
| Server entry | `serve.py` |
| App factory | `app/__init__.py` |
| Main frontend init | `static/js/main.js` |
| Root UI coordinator | `static/js/uis/App.js` |
| Pipeline executor | `static/js/uis/Generator.js` |
| Generator registry | `static/js/adapter.js` |
| Segment parser | `static/js/segmentparser.js` |
| Xianyu adapter | `static/js/adapters/XianyuAdapter.js` |
| Abstract base adapter | `static/js/adapters/BaseAdapters.js` |
| Response parsing | `static/js/adapters/ResponseParser.js` |
| Widget base helpers | `static/js/components/utils.js` |
| Default tabs config | `static/js/components/ConfigTabs.js` |
| Drag panel container | `static/js/components/ConfigPanel.js` |
| Config CRUD modal | `static/js/components/ConfigModal.js` |
| Settings modal | `static/js/components/SettingsModal.js` |
| Canvas (SVG render) | `static/js/components/Canvas.js` |
| History panel | `static/js/components/HistoryPanel.js` |
| Generate call widget | `static/js/components/widgets/GenerateCallWidget.js` |
| App state persistence | `static/js/uis/persistence.js` |
| Config storage CRUD | `static/js/storage.js` |
| All CSS styles | `static/css/workspace.css` |
| HTML shell | `templates/index.html` |
| Server config | `settings.yaml` |

### External Documentation

- **FastAPI**: https://fastapi.tiangolo.com/
- **uvicorn**: https://www.uvicorn.org/
- **waitress**: https://docs.pylonsproject.org/projects/waitress/
- **a2wsgi**: https://github.com/abersheeran/a2wsgi

### Architecture Decision Records

1. **No frontend framework** — Vanilla JS was chosen to minimize dependencies and bundle size. All DOM manipulation uses the `el()` helper.
2. **No build step** — ES modules are served natively. No webpack/vite/babel. This means `import` paths must end in `.js`.
3. **localStorage only** — No database. All data lives in the browser. Users should be aware that clearing browser data destroys their configs and history.
4. **Adapter pattern** — Each AI provider is wrapped in its own adapter class, making it easy to add new providers without modifying core pipeline logic.
5. **CSS Custom Properties for theming** — All colors are resolved at runtime via CSS variables, set by JavaScript. This avoids CSS-in-JS complexity while supporting full dark/light theme customization.

---
*This guide was auto-generated from codebase analysis. Please verify and update sections marked as needing verification.*