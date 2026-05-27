window.devtoolsFormatters = [
  {
    header(obj) {
      if (obj?.__strokeType === "AdapterResponse") {
        return [
          "div",
          { style: "background:#1a1a2e;color:#e94560;padding:2px 6px;border-radius:3px;font-family:monospace" },
          `GPT Response | model: ${obj.model ?? "?"}, images: ${obj.images?.length ?? 0}, tokens: ${obj.usage?.total_tokens ?? "?"}`,
        ]
      }
      if (obj?.__strokeType === "ConfigState") {
        return [
          "div",
          { style: "background:#16213e;color:#53d8fb;padding:2px 6px;border-radius:3px;font-family:monospace" },
          `Config | ${obj.tab ?? "unknown"} | ${Object.keys(obj.params ?? {}).length} params`,
        ]
      }
      if (obj?.__strokeType === "CanvasState") {
        return [
          "div",
          { style: "background:#0f3460;color:#e94560;padding:2px 6px;border-radius:3px;font-family:monospace" },
          `Canvas | ${obj.width ?? "?"}x${obj.height ?? "?"}, layers: ${obj.layers?.length ?? 0}`,
        ]
      }
      return null
    },

    hasBody(obj) {
      return obj?.__strokeType === "AdapterResponse"
        || obj?.__strokeType === "ConfigState"
        || obj?.__strokeType === "CanvasState"
    },

    body(obj) {
      const entries = Object.entries(obj).filter(([k]) => !k.startsWith("__"))
      return [
        "ol",
        { style: "margin:0;padding:2px 0 2px 20px" },
        ...entries.map(([k, v]) => [
          "li",
          {},
          ["span", { style: "font-weight:bold" }, `${k}: `],
          ["span", { style: "color:#999" }, typeof v === "object" ? JSON.stringify(v) : String(v)],
        ]),
      ]
    },
  },
]
