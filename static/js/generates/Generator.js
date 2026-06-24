/**
 * Generator.js — 生成管线协调
 * 将 _doGenerate 从 App 解耦，按 segment 逐段调用生成器。
 */

import { computeContentFingerprint } from '../services/segmentparser.js';
import { showToast } from '../utils/Toast.js';
import { showAlertModal } from '../utils/AlertModal.js';
import GenerationPipeline from './GenerationPipeline.js';

/**
 * 执行完整的生成管线
 * 委托给 GenerationPipeline + LineageManager。
 * @param {import('../uis/App.js').default} app
 */
export async function performGeneration(app) {
  const tabsConfig = app.config.tabsConfig;
  const tabValues = app.config.getTabValues();
  const scheduler = app.scheduler;

  const callWidgetConfigs = {};
  for (const [k, w] of Object.entries(app.config.widgets || {})) {
    if (w.def && w.def.type === 'generate_call' && w.widget && typeof w.widget.getConfig === 'function') {
      callWidgetConfigs[k] = w.widget.getConfig();
    }
  }

  const { canStart, blocked, available, configIds } = scheduler.checkConcurrency(callWidgetConfigs);
  if (!canStart) {
    const blockedNames = blocked.map(b => `「${b.name}」(${b.used}/${b.limit})`).join('、');
    const availNames = available.map(a => `「${a.name}」(${a.used}/${a.limit})`).join('、');
    const msg = `已达并发上限：${blockedNames}` + (availNames ? `\n仍有可用：${availNames}` : '');
    showAlertModal('并发限制', msg);
    return;
  }

  scheduler.acquire(configIds);

  try {
    const contentFp = computeContentFingerprint(tabsConfig, tabValues);
    app._generatingFp = contentFp;

    app.canvas.setGenerating(true);

    app.config.generating = true;
    app.config.genBtn.textContent = '生成中...';
    app.config.genBtn.disabled = true;
    if (app.config.exportBtn) app.config.exportBtn.style.display = 'none';

    // 获取 manager 实例（由 App 构造函数注入）
    const lineageManager = app._lineageManager;

    // ★ 先生成占位 lineage，让 HistoryPanel 显示「生成中」
    const tabsToSave = tabsConfig.filter(tab => tab.unpersist !== true);
    const { lineageId } = lineageManager.matchOrCreate(contentFp, {
      tabValues,
      tabsConfig: tabsToSave.map(t => ({ ...t })),
      tabOrder: tabsConfig.map(t => t.id)
    });
    app.currentLineageId = lineageId;
    app._rebuildHistoryItems();
    app.history.render();

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
        const currentFp = computeContentFingerprint(app.config.tabsConfig, app.config.getTabValues());
        const isStillViewing = app._generatingFp === currentFp;

        if (succeeded === 0) {
          showToast(`所有 ${totalSegments} 段生成均已失败`, 'error', 10000);
          if (isStillViewing && app._generatingStartTime) {
            app.canvas.setFailed(app._generatingStartTime);
          }
        } else if (isStillViewing) {
          app.canvas.setGenerating(false);
        }
      }
    });

    // 启动管线并等待完成
    await pipeline.start(tabsConfig, tabValues, callWidgetConfigs);

    // 管线完成后保存 lineage
    try {
      await _onPipelineComplete(pipeline, app, lineageManager, tabValues, tabsConfig);
    } catch (err) {
      console.error('[Generator] lineage 保存失败:', err);
      showToast('保存生成结果失败', 'error', 5000);
    }

    // 设置下载源为当前 lineage 版本
    if (app.currentLineageId) {
      app.config.setDownloadLineage(app.currentLineageId, app.currentVersionIndex);
    }
  } finally {
    scheduler.release(configIds);
    app.canvas.setGenerating(false);
    if (scheduler.activeCount === 0) {
      app._generatingFp = null;
      app._generatingStartTime = null;
      app.config.onGenComplete();
    }
  }
}

/**
 * 管线完成后的处理：创建/更新 lineage 和持久化
 */
async function _onPipelineComplete(pipeline, app, lineageManager, tabValues, tabsConfig) {
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

  const contentFp = computeContentFingerprint(tabsConfig, tabValues);

  const tabsToSave = tabsConfig.filter(tab => tab.unpersist !== true);
  const { lineageId, isNew } = lineageManager.matchOrCreate(contentFp, {
    tabValues,
    tabsConfig: tabsToSave.map(t => ({ ...t })),
    tabOrder: tabsConfig.map(t => t.id)
  });

  const versionIndex = lineageManager.addVersion(lineageId, {
    type: lastResult.type || 'svg',
    svg: lastResult.svg || '',
    dataUrl: lastResult.dataUrl || '',
    thumbnail: lastResult.thumbnail || '',
    time: timeStr
  });

  if (lastResult.dataUrl || lastResult.svg) {
    await lineageManager.saveVersionBinary(lineageId, versionIndex, {
      dataUrl: lastResult.dataUrl || '',
      thumbnail: lastResult.thumbnail || '',
      svg: lastResult.svg || ''
    });
  }

  const wasSwitchedAway = (() => {
    try {
      return contentFp !== computeContentFingerprint(app.config.tabsConfig, app.config.getTabValues());
    } catch (e) {
      return true;
    }
  })();

  if (wasSwitchedAway) {
    console.log(`[Generator] 用户已切出 lineage ${lineageId}，结果仅保存不跳转`);
  } else {
    app.currentLineageId = lineageId;
    app.currentVersionIndex = versionIndex;
    app.canvas.loadVersion(lastResult);
  }

  const lineage = app.versionLineages[lineageId];
  if (lineage) {
    if (typeof lineage.updateHistory === 'function') {
      lineage.updateHistory(
        versionIndex,
        lastResult.type,
        lastResult.svg,
        timeStr,
        lastResult.thumbnail || ''
      );
    }
  }

  app._rebuildHistoryItems();
  app.history.render();

  if (app._persistenceGuard) {
    app._persistenceGuard.markDirty();
    await app._persistenceGuard.flush();
  }

  console.log(`[Generator] Lineage ${lineageId} v${versionIndex} 已保存 (isNew=${isNew}${wasSwitchedAway ? ', 已切出' : ''})`);
}