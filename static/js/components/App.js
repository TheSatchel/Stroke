/**
 * App.js — 根协调器
 */

import HistoryPanel from './HistoryPanel.js';
import Canvas from './Canvas.js';
import ConfigPanel from './ConfigPanel.js';
import SettingsModal from './SettingsModal.js';

export default class App {
  constructor(mount) {
    this.el = mount;
    this.el.className = 'app';
    this.el.innerHTML = '';

    this.history = new HistoryPanel(document.createElement('div'));
    this.el.appendChild(this.history.container);

    this.canvas = new Canvas(document.createElement('div'));
    this.el.appendChild(this.canvas.container);

    this.config = new ConfigPanel(document.createElement('div'));
    this.el.appendChild(this.config.container);

    this.settings = new SettingsModal(document.createElement('div'));
    this.el.appendChild(this.settings.overlay);

    this.history.onSelect = (i) => {
      this.canvas.showHistory(i);
      if (i === 0) {
        this.config.showRegionBlock();
      } else {
        this.config.hideRegionBlock();
      }
    };

    this.canvas.onLassoDone = () => {
      this.config.showRegionBlock();
    };

    this.config.onGenerate = () => {
      this.config.onGenComplete();
    };

    this.config.onSettingsOpen = () => {
      this.settings.open();
    };
  }
}