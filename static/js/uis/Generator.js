/**
 * Generator.js — 生成管线协调
 * 将 _doGenerate 从 App 解耦，按 segment 逐段调用生成器。
 */

import { parse as parseSegments, computeFullFingerprint, computeStructuralFingerprint } from '../segmentparser.js';
import { loadConfigs } from '../storage.js';
import { saveAppState } from './persistence.js';
import { svgToBase64DataUrl } from '../adapters/ResponseParser.js';
import { showToast, showWarningToast } from '../components/Toast.js';

/**
 * 执行完整的生成管线
 * @param {import('./App.js').default} app
 */
export async function performGeneration(app) {
  if (app.config.generating) return;
  app.config.generating = true;
  app.config.genBtn.textContent = '生成中...';
  app.config.genBtn.disabled = true;
  if (app.config.exportBtn) app.config.exportBtn.style.display = 'none';

  const regionWidget = app.config.widgets['region_prompt'];
  const regionVal = regionWidget ? regionWidget.widget.getValue() : '';
  const label = regionVal ? '区域 prompt' : null;

  const tabsConfig = app.config.tabsConfig;
  const tabValues = app.config.getTabValues();

  // 收集每个 generate_call widget 的完整配置
  const callWidgetConfigs = {};
  for (const [k, w] of Object.entries(app.config.widgets || {})) {
    if (w.def && w.def.type === 'generate_call' && w.widget && typeof w.widget.getConfig === 'function') {
      callWidgetConfigs[k] = w.widget.getConfig();
    }
  }

  // 切分段（configId 仍用于 segment 标定）
  const configIds = {};
  for (const [k, v] of Object.entries(callWidgetConfigs)) {
    configIds[k] = v.configId;
  }
  const segments = parseSegments(tabsConfig, tabValues, configIds);

  // 逐段生成
  let lastBase64 = null;
  const segmentResults = [];

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const callWidgetEntry = app.config.widgets[seg.callTabId];
    const widget = callWidgetEntry ? callWidgetEntry.widget : null;

    if (widget) {
      widget.updateSummary(seg.prompt || '(无 prompt)');
      widget.setGenerating();
    }

    // 获取该段的配置并切换 adapter
    const callCfg = callWidgetConfigs[seg.callTabId];
    if (callCfg && callCfg.configId) {
      const allConfigs = loadConfigs();
      const cfg = allConfigs.find(c => c.id === callCfg.configId);
      if (cfg) {
        const perCallCfg = {
          apiKey: cfg.apiKey,
          endpoint: cfg.endpoint,
          model: cfg.model,
          fallbackModel: cfg.fallbackModel,
          concurrency: cfg.concurrency,
          ...cfg.params,
          ...(callCfg.params || {})
        };
        app.generator.use(cfg.adapter, perCallCfg);
      }
    }

    try {
      // 合并本地上传图 + 上一段生成结果
      const imageList = [...seg.imageBase64List];
      if (lastBase64 && !imageList.includes(lastBase64)) {
        console.log(`[Generator] 段${si} 追加上游结果图 (${(lastBase64.length / 1024).toFixed(1)}KB)`);
        imageList.push(lastBase64);
      }
      console.log(`[Generator] 段${si} 最终图片数: ${imageList.length} (本地${seg.imageBase64List.length} + 上游${lastBase64 && !seg.imageBase64List.includes(lastBase64) ? 1 : 0})`);

      const imageResult = await app.generator.generate({
        prompt: seg.prompt,
        imageBase64List: imageList
      });

      // 根据 ImageResult.type 分派
      if (imageResult.type === 'raster') {
        // 光栅图：dataUrl 就是可用图片
        lastBase64 = imageResult.dataUrl || '';
      } else {
        // SVG：编码为 base64 data URL
        lastBase64 = svgToBase64DataUrl(imageResult.svg || '');
        if (!lastBase64) {
          showWarningToast('SVG 转 base64 失败，结果仍保留');
        }
      }

      segmentResults.push({
        callTabId: seg.callTabId,
        type: imageResult.type || 'svg',
        svg: imageResult.type === 'svg' ? imageResult.svg : '',
        dataUrl: imageResult.type === 'raster' ? imageResult.dataUrl : '',
        base64: lastBase64
      });

      if (widget) {
        widget.setResult(imageResult, lastBase64);
        widget.setDone();
      }
    } catch (err) {
      console.error('[uis] 段生成失败:', seg.callTabId, err);
      showToast('生成失败: ' + (err.message || String(err)), 'error', 10000);
      if (widget) {
        widget.setDone();
        widget.updateSummary('生成失败');
      }
    }
  }

  app.config.onGenComplete();

  if (segmentResults.length > 0) {
    const lastResult = segmentResults[segmentResults.length - 1];
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                    now.getMinutes().toString().padStart(2, '0');
    const genId = 'gen_' + (app.history.items.length + 1);

    const structuralFp = computeStructuralFingerprint(tabsConfig);
    let lineageId = app.configFingerprints[structuralFp];
    let versionIndex = 0;

    if (lineageId && app.versionLineages[lineageId]) {
      versionIndex = app.versionLineages[lineageId].versions.length;
      app.versionLineages[lineageId].versions.push({
        index: versionIndex,
        type: lastResult.type || 'svg',
        svg: lastResult.svg || '',
        dataUrl: lastResult.dataUrl || '',
        time: timeStr
      });
      // 更新 lineage 的 tabValues
      app.versionLineages[lineageId].tabValues = tabValues;
      app.history.updateActiveItem(versionIndex, lastResult, timeStr);
      app.currentLineageId = lineageId;
      app.currentVersionIndex = versionIndex;
      saveAppState(app);
      return;
    }

    lineageId = 'lineage_' + Date.now();
    app.versionLineages[lineageId] = {
      fingerprint: structuralFp,
      versions: [{ index: 0, type: lastResult.type || 'svg', svg: lastResult.svg || '', dataUrl: lastResult.dataUrl || '', time: timeStr }],
      historyItemIndex: 0,
      tabValues: tabValues
    };
    app.configFingerprints[structuralFp] = lineageId;
    app.currentLineageId = lineageId;
    app.currentVersionIndex = 0;

    app.history.addItem({
      label: genId,
      time: timeStr,
      versionCount: app.versionLineages[lineageId].versions.length,
      versionActive: 0,
      lineageId: lineageId,
      type: lastResult.type || 'svg',
      svg: lastResult.svg || '',
      dataUrl: lastResult.dataUrl || '',
      regionLabel: label,
      active: true,
      current: true
    });

    saveAppState(app);
  }
}