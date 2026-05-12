/**
 * Generator.js — 生成管线协调
 * 将 _doGenerate 从 App 解耦，按 segment 逐段调用生成器。
 */

import { computeContentFingerprint } from './segmentparser.js';
import { showToast } from '../utils/Toast.js';
import GenerationPipeline from './GenerationPipeline.js';

/**
 * 执行完整的生成管线
 * 委托给 GenerationPipeline + LineageManager。
 * @param {import('../uis/App.js').default} app
 */
export async function performGeneration(app) {
  if (app.config.generating) return;
  app.config.generating = true;
  app.config.genBtn.textContent = '生成中...';
  app.config.genBtn.disabled = true;
  if (app.config.exportBtn) app.config.exportBtn.style.display = 'none';

  const tabsConfig = app.config.tabsConfig;
  const tabValues = app.config.getTabValues();

  // 收集每个 generate_call widget 的完整配置
  const callWidgetConfigs = {};
  for (const [k, w] of Object.entries(app.config.widgets || {})) {
    if (w.def && w.def.type === 'generate_call' && w.widget && typeof w.widget.getConfig === 'function') {
      callWidgetConfigs[k] = w.widget.getConfig();
    }
  }

  // 获取 manager 实例（由 App 构造函数注入）
  const lineageManager = app._lineageManager;

  // 创建管线
  const pipeline = new GenerationPipeline(app.generator, lineageManager, {
    onSegmentStart(task, segmentIndex, totalSegments) {
      const callWidgetEntry = app.config.widgets[task.callTabId];
      const widget = callWidgetEntry ? callWidgetEntry.widget : null;
      if (widget) {
        widget.updateSummary(task.prompt || '(无 prompt)');
        widget.setGenerating();
        // 展示段进度
        if (widget._resultPreview && typeof widget._resultPreview.setProgress === 'function') {
          widget._resultPreview.setProgress(segmentIndex, totalSegments);
        }
      }
    },

    onSegmentRetry(task, attempt, maxRetries, segmentIndex, totalSegments) {
      const callWidgetEntry = app.config.widgets[task.callTabId];
      const widget = callWidgetEntry ? callWidgetEntry.widget : null;
      if (widget && widget._resultPreview && typeof widget._resultPreview.setRetrying === 'function') {
        widget._resultPreview.setRetrying(attempt, maxRetries);
      }
    },

    onSegmentDone(task) {
      const callWidgetEntry = app.config.widgets[task.callTabId];
      const widget = callWidgetEntry ? callWidgetEntry.widget : null;
      if (widget && task.result) {
        widget.setResult(
          { type: task.result.type, svg: task.result.svg, dataUrl: task.result.dataUrl },
          task.result.base64
        );
        widget.setDone();
      }
    },

    onSegmentFail(task, err) {
      const callWidgetEntry = app.config.widgets[task.callTabId];
      const widget = callWidgetEntry ? callWidgetEntry.widget : null;
      if (widget) {
        widget.setDone();
        widget.updateSummary('生成失败');
      }
      showToast('段生成失败: ' + (err.message || String(err)), 'error', 10000);
    },

    onAllDone(succeeded, totalSegments) {
      if (succeeded === 0) {
        showToast(`所有 ${totalSegments} 段生成均已失败`, 'error', 10000);
      }
      app.config.onGenComplete();
    }
  });

  // 启动管线
  pipeline.start(tabsConfig, tabValues, callWidgetConfigs);

  // 轮询等待管线完成，然后保存 lineage
  _waitForPipelineAndSave(pipeline, app, lineageManager, tabValues, tabsConfig);
}

/**
 * 轮询等待管线完成并创建/更新 lineage
 */
function _waitForPipelineAndSave(pipeline, app, lineageManager, tabValues, tabsConfig) {
  const checkInterval = setInterval(() => {
    if (!pipeline.running) {
      clearInterval(checkInterval);
      _onPipelineComplete(pipeline, app, lineageManager, tabValues, tabsConfig);
    }
  }, 200);
}

/**
 * 管线完成后的处理：创建/更新 lineage 和持久化
 */
async function _onPipelineComplete(pipeline, app, lineageManager, tabValues, tabsConfig) {
  // 收集成功的段结果
  const results = pipeline.tasks
    .filter(t => t.status === 'done' && t.result)
    .map(t => t.result);

  if (results.length === 0) {
    console.warn('[Generator] 没有成功的段结果');
    return;
  }

  const lastResult = results[results.length - 1];
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                  now.getMinutes().toString().padStart(2, '0');

  // 计算完整内容指纹（含 prompt 值）—— Issue 4 修正
  const contentFp = computeContentFingerprint(tabsConfig, tabValues);

  // 匹配或创建 lineage
  const tabsToSave = app.config.tabsConfig.filter(tab => tab.unpersist !== true);
  const { lineageId, isNew } = lineageManager.matchOrCreate(contentFp, {
    tabValues,
    tabsConfig: tabsToSave.map(t => ({ ...t })),
    tabOrder: app.config.tabsConfig.map(t => t.id)
  });

  // 追加版本
  const versionIndex = lineageManager.addVersion(lineageId, {
    type: lastResult.type || 'svg',
    svg: lastResult.svg || '',
    dataUrl: lastResult.dataUrl || '',
    thumbnail: lastResult.thumbnail || '',
    time: timeStr
  });

  // 保存二进制到 IndexedDB
  if (lastResult.dataUrl || lastResult.svg) {
    await lineageManager.saveVersionBinary(lineageId, versionIndex, {
      dataUrl: lastResult.dataUrl || '',
      thumbnail: lastResult.thumbnail || '',
      svg: lastResult.svg || ''
    });
  }

  // 更新视图状态
  app.currentLineageId = lineageId;
  app.currentVersionIndex = versionIndex;

  // ★ 将最终结果加载到画布上
  app.canvas.loadVersion(lastResult);

  // 历史面板
  if (isNew) {
    const genId = 'gen_' + (app.history.items.length + 1);
    app.history.addItem({
      label: genId,
      time: timeStr,
      versionCount: 1,
      versionActive: 0,
      lineageId,
      type: lastResult.type || 'svg',
      svg: lastResult.svg || '',
      dataUrl: lastResult.dataUrl || '',
      active: true,
      current: true
    });
  } else {
    app.history.updateActiveItem(versionIndex, lastResult, timeStr);
  }

  // 持久化 lineage 元数据
  lineageManager.persistMeta();

  // 触发 PersistenceGuard 保存
  if (app._persistenceGuard) {
    app._persistenceGuard.markDirty();
    await app._persistenceGuard.flush();
  }

  console.log(`[Generator] Lineage ${lineageId} v${versionIndex} 已保存 (isNew=${isNew})`);
}