// ==UserScript==
// @name         Low-Profile-Fingerprint
// @namespace    https://github.com/Devzinh/Low-Profile-Fingerprint
// @version      1.4.0
// @description  Disfarça seu navegador: normaliza sinais comuns de fingerprint e adiciona ruído leve por sessão para reduzir rastreamento sem quebrar sites.
// @author       Rony Gabriel
// @homepageURL  https://github.com/Devzinh/Low-Profile-Fingerprint
// @supportURL   https://github.com/Devzinh/Low-Profile-Fingerprint/issues
// @updateURL    https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js
// @downloadURL  https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js
// @license      MIT
// @match        *://*/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_NAME = 'Low-Profile Fingerprint';
  const SCRIPT_VERSION = '1.4.0';
  const root = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : window;
  const mark = typeof Symbol === 'function' ? Symbol.for('lowProfileFingerprint.wrapped') : '__lowProfileFingerprintWrapped__';
  const nativeSource = typeof WeakMap === 'function' ? new WeakMap() : null;
  const audioSeen = typeof WeakSet === 'function' ? new WeakSet() : null;
  const fnToString = root.Function && root.Function.prototype && root.Function.prototype.toString;
  const defaults = Object.freeze({
    screen: true,
    navigator: true,
    timezone: true,
    canvas: true,
    fonts: true,
    clientRects: true,
    connection: true,
    speech: true,
    battery: true,
    webgl: true,
    webglPixels: true,
    audio: true,
  });
  const labels = Object.freeze({
    screen: 'Screen',
    navigator: 'Navigator',
    timezone: 'Timezone',
    canvas: 'Canvas',
    fonts: 'Fonts',
    clientRects: 'Element rects',
    connection: 'NetworkInformation',
    speech: 'Speech voices',
    battery: 'Battery API',
    webgl: 'WebGL',
    webglPixels: 'WebGL pixel buffer',
    audio: 'Audio',
  });
  // v1.4.0: privacy modes scale entropy reduction and noise intensity in one place.
  const MODES = Object.freeze({
    light: Object.freeze({ screenStep: 32, hwStep: 1, canvasSamples: 48, canvasMax: 1, glScale: 0.5, audioScale: 0.5, rectScale: 0.02 }),
    balanced: Object.freeze({ screenStep: 64, hwStep: 2, canvasSamples: 96, canvasMax: 2, glScale: 1, audioScale: 1, rectScale: 0.05 }),
    strict: Object.freeze({ screenStep: 100, hwStep: 4, canvasSamples: 192, canvasMax: 3, glScale: 2, audioScale: 2, rectScale: 0.1 }),
  });
  const MODE_ORDER = Object.freeze(['light', 'balanced', 'strict']);
  const DEFAULT_MODE = 'balanced';
  const diagnostics = [];
  const MAX_DIAGNOSTICS = 80;
  const DEBUG_KEY = 'lowProfileFingerprint.debug';
  let debugMode = false;
  let debugModeReady = false;
  const Native = capture(root);
  debugMode = readDebugMode();
  debugModeReady = true;
  const settings = Object.keys(defaults).reduce((acc, key) => {
    acc[key] = readSetting(key);
    return acc;
  }, {});
  const mode = readMode();
  const cfg = MODES[mode] || MODES[DEFAULT_MODE];
  const session = makeProfile(makeSeed());
  const disabledHere = isExcludedHost(host());

  registerMenu();
  if (!disabledHere) {
    patchToString();
    [
      ['screen', patchScreen],
      ['navigator', patchNavigator],
      ['timezone', patchTimezone],
      ['canvas', patchCanvas],
      ['fonts', patchFonts],
      ['clientRects', patchClientRects],
      ['connection', patchConnection],
      ['speech', patchSpeech],
      ['battery', patchBattery],
      ['webgl', patchWebGL],
      ['webglPixels', patchWebGLPixels],
      ['audio', patchAudio],
    ].forEach(([key, patch]) => {
      if (!settings[key]) return;
      try {
        patch();
      } catch (error) {
        reportIssue('patch:' + key, error);
      }
    });
  }

  // REFACTOR v1.2.0: snapshot real browser signals before any patch replaces getters.
  function capture(win) {
    const canvas = win.HTMLCanvasElement && win.HTMLCanvasElement.prototype;
    const c2d = win.CanvasRenderingContext2D && win.CanvasRenderingContext2D.prototype;
    const gl1 = win.WebGLRenderingContext && win.WebGLRenderingContext.prototype;
    const gl2 = win.WebGL2RenderingContext && win.WebGL2RenderingContext.prototype;
    const dtf = win.Intl && win.Intl.DateTimeFormat;
    const nav = win.navigator || {};
    return {
      screen: win.Screen && win.Screen.prototype,
      nav: win.Navigator && win.Navigator.prototype,
      rawPlugins: nav.plugins || null,
      rawMimeTypes: nav.mimeTypes || null,
      element: win.Element && win.Element.prototype,
      plugins: realPluginEntries(nav.plugins),
      mimeTypes: realMimeTypeEntries(nav.mimeTypes),
      connectionInfo: realConnection(nav),
      webglInfo: realWebGLInfo(win),
      canvas,
      c2d,
      gl1,
      gl2,
      date: (win.Date || Date).prototype,
      DateCtor: win.Date || Date,
      dtf,
      dtfp: dtf && dtf.prototype,
      speech: win.SpeechSynthesis && win.SpeechSynthesis.prototype,
      connection: win.NetworkInformation && win.NetworkInformation.prototype,
      audioBuffer: win.AudioBuffer && win.AudioBuffer.prototype,
      analyser: win.AnalyserNode && win.AnalyserNode.prototype,
      getImageData: c2d && c2d.getImageData,
      putImageData: c2d && c2d.putImageData,
      measureText: c2d && c2d.measureText,
      toDataURL: canvas && canvas.toDataURL,
      toBlob: canvas && canvas.toBlob,
      getTimezoneOffset: (win.Date || Date).prototype.getTimezoneOffset,
      resolvedOptions: dtf && dtf.prototype && dtf.prototype.resolvedOptions,
      gl1GetParameter: gl1 && gl1.getParameter,
      gl2GetParameter: gl2 && gl2.getParameter,
      gl1ReadPixels: gl1 && gl1.readPixels,
      gl2ReadPixels: gl2 && gl2.readPixels,
      getChannelData: win.AudioBuffer && win.AudioBuffer.prototype && win.AudioBuffer.prototype.getChannelData,
      getFloatFrequencyData: win.AnalyserNode && win.AnalyserNode.prototype && win.AnalyserNode.prototype.getFloatFrequencyData,
      createElement: win.document && win.document.createElement.bind(win.document),
      supportedValuesOf: win.Intl && typeof win.Intl.supportedValuesOf === 'function' ? win.Intl.supportedValuesOf.bind(win.Intl) : null,
    };
  }

  function hash(value) {
    let h = 2166136261;
    value = String(value);
    for (let i = 0; i < value.length; i += 1) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(input) {
    let state = hash(input) || 1;
    return function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) % 1000000) / 1000000;
    };
  }

  function clamp(value, min, max) {
    value = Number(value);
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function bucket(value, step) {
    value = Number(value);
    return Number.isFinite(value) && step ? Math.round(value / step) * step : 0;
  }

  function finiteBucket(value, step) {
    value = Number(value);
    return Number.isFinite(value) && step ? Math.round(value / step) * step : undefined;
  }

  function normalizedText(value, maxLength) {
    if (typeof value !== 'string') {
      if (value === null || typeof value === 'undefined') return '';
      value = String(value);
    }
    const normalized = value.replace(/\s+/g, ' ').trim();
    return maxLength && normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
  }

  function compareText(left, right) {
    left = String(left).toLowerCase();
    right = String(right).toLowerCase();
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  function uniqueEntries(entries, keyFor) {
    const seen = Object.create(null);
    return entries
      .filter((entry) => {
        const keyValue = keyFor(entry);
        if (!keyValue || seen[keyValue]) return false;
        seen[keyValue] = true;
        return true;
      })
      .sort((a, b) => compareText(keyFor(a), keyFor(b)));
  }

  function realPluginEntries(plugins) {
    if (!plugins) return null;
    try {
      const entries = [];
      for (let i = 0; i < plugins.length; i += 1) {
        const plugin = typeof plugins.item === 'function' ? plugins.item(i) : plugins[i];
        if (!plugin) continue;
        const entry = {
          ref: plugin,
          name: normalizedText(plugin.name, 120),
          filename: normalizedText(plugin.filename, 160),
          description: normalizedText(plugin.description, 200),
          mimeTypes: [],
        };
        try {
          const mimeLen = Number(plugin.length) || 0;
          for (let j = 0; j < mimeLen; j += 1) {
            const mimeType = typeof plugin.item === 'function' ? plugin.item(j) : plugin[j];
            if (!mimeType) continue;
            const mimeEntry = {
              ref: mimeType,
              type: normalizedText(mimeType.type, 120),
              suffixes: normalizedText(mimeType.suffixes, 120),
              description: normalizedText(mimeType.description, 200),
            };
            if (mimeEntry.type) entry.mimeTypes.push(mimeEntry);
          }
        } catch (error) {
          reportIssue('capture:plugins:mimeTypes', error, { plugin: entry.name || i });
        }
        if (entry.name || entry.filename || entry.description) entries.push(entry);
      }
      return uniqueEntries(entries, (entry) => [entry.name, entry.filename, entry.description].join('|'));
    } catch (error) {
      reportIssue('capture:plugins', error);
      return null;
    }
  }

  function realMimeTypeEntries(mimeTypes) {
    if (!mimeTypes) return null;
    try {
      const entries = [];
      for (let i = 0; i < mimeTypes.length; i += 1) {
        const mimeType = typeof mimeTypes.item === 'function' ? mimeTypes.item(i) : mimeTypes[i];
        if (!mimeType) continue;
        const entry = {
          ref: mimeType,
          type: normalizedText(mimeType.type, 120),
          suffixes: normalizedText(mimeType.suffixes, 120),
          description: normalizedText(mimeType.description, 200),
          enabledPluginName: mimeType.enabledPlugin ? normalizedText(mimeType.enabledPlugin.name, 120) : '',
        };
        if (entry.type) entries.push(entry);
      }
      return uniqueEntries(entries, (entry) => [entry.type, entry.suffixes, entry.description].join('|'));
    } catch (error) {
      reportIssue('capture:mimeTypes', error);
      return null;
    }
  }

  function realConnection(nav) {
    const connection = nav && (nav.connection || nav.mozConnection || nav.webkitConnection);
    if (!connection) return null;
    try {
      const rtt = finiteBucket(connection.rtt, 25);
      const downlink = finiteBucket(connection.downlink, 0.5);
      return {
        rtt: typeof rtt === 'number' ? Math.max(0, rtt) : undefined,
        downlink: typeof downlink === 'number' ? Number(Math.max(0, downlink).toFixed(1)) : undefined,
        type: typeof connection.type === 'string' ? normalizedText(connection.type, 40) : undefined,
        effectiveType: typeof connection.effectiveType === 'string' ? normalizedText(connection.effectiveType, 40) : undefined,
      };
    } catch (_) {
      return null;
    }
  }

  function realWebGLInfo(win) {
    try {
      if (!win.document || typeof win.document.createElement !== 'function') return {};
      const canvas = win.document.createElement('canvas');
      const names = ['webgl', 'experimental-webgl', 'webgl2'];
      for (let i = 0; i < names.length; i += 1) {
        let gl = null;
        try { gl = canvas.getContext(names[i]); } catch (_) { gl = null; }
        if (!gl || typeof gl.getParameter !== 'function') continue;
        return {
          vendor: normalizedText(gl.getParameter(gl.VENDOR), 80),
          renderer: normalizedText(gl.getParameter(gl.RENDERER), 120),
        };
      }
    } catch (_) {}
    return {};
  }

  function host() {
    try { return root.location && root.location.hostname || location.hostname || ''; } catch (_) { return ''; }
  }

  function makeSeed() {
    const key = '__low_profile_fingerprint_seed__';
    try {
      const storage = root.sessionStorage;
      const current = storage && storage.getItem(key);
      if (current) return current;
      const next = randomSeed();
      if (storage) storage.setItem(key, next);
      return next;
    } catch (_) {
      return randomSeed();
    }
  }

  function randomSeed() {
    const values = new Uint32Array(4);
    const cryptoRef = root.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (cryptoRef && cryptoRef.getRandomValues) {
      cryptoRef.getRandomValues(values);
      return Array.from(values).join('-');
    }
    return [Date.now(), Math.random(), host().length].join('-');
  }

  // REFACTOR v1.2.0: build the session profile only from captured real values.
  function makeProfile(seed) {
    const rand = rng(seed + '|' + host());
    const screen = root.screen || {};
    const nav = root.navigator || {};
    const width = Math.max(0, bucket(screen.width, cfg.screenStep));
    const height = Math.max(0, bucket(screen.height, cfg.screenStep));
    const availWidth = Math.min(width, Math.max(0, finiteBucket(screen.availWidth, cfg.screenStep) || width));
    const availHeight = Math.min(height, Math.max(0, finiteBucket(screen.availHeight, cfg.screenStep) || height));
    const colorDepth = finiteBucket(screen.colorDepth, 1);
    const pixelDepth = finiteBucket(screen.pixelDepth, 1);
    const hardwareConcurrency = finiteBucket(nav.hardwareConcurrency, cfg.hwStep);
    const deviceMemory = Number(nav.deviceMemory);
    const offset = realTimezoneOffset();
    return {
      seed,
      width,
      height,
      availWidth,
      availHeight,
      colorDepth: typeof colorDepth === 'number' ? Math.max(0, colorDepth) : undefined,
      pixelDepth: typeof pixelDepth === 'number' ? Math.max(0, pixelDepth) : undefined,
      timezoneOffset: offset,
      timezoneLabel: nativeTimezoneLabel() || 'UTC',
      nativeTimezoneLabel: nativeTimezoneLabel(),
      hardwareConcurrency: typeof hardwareConcurrency === 'number' ? Math.max(1, hardwareConcurrency) : undefined,
      deviceMemory: Number.isFinite(deviceMemory) ? Math.max(0, deviceMemory) : undefined,
      canvasShift: [randInt(rand, -cfg.canvasMax, cfg.canvasMax) || 1, randInt(rand, -cfg.canvasMax, cfg.canvasMax), randInt(rand, -cfg.canvasMax, cfg.canvasMax)],
      webglVendor: Native.webglInfo && Native.webglInfo.vendor || undefined,
      webglRenderer: Native.webglInfo && Native.webglInfo.renderer || undefined,
      connection: Native.connectionInfo,
      plugins: Native.plugins,
      mimeTypes: Native.mimeTypes,
    };
  }

  function randInt(rand, min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
  }

  function realTimezoneOffset() {
    try { return Native.getTimezoneOffset.call(new Native.DateCtor()); } catch (_) { return new Date().getTimezoneOffset(); }
  }

  function nativeTimezoneLabel() {
    try {
      const formatter = new Native.dtf();
      return Native.resolvedOptions.call(formatter).timeZone || null;
    } catch (_) {
      return null;
    }
  }

  function key(name) {
    return 'lowProfileFingerprint.patch.' + name;
  }

  function readSetting(name) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(key(name), defaults[name]) !== false;
    } catch (_) {}
    return defaults[name];
  }

  function writeSetting(name, value) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key(name), Boolean(value));
    } catch (_) {}
  }

  // v1.4.0: persist the active privacy mode and fall back to balanced when unset or invalid.
  const modeKey = 'lowProfileFingerprint.mode';

  function readMode() {
    try {
      if (typeof GM_getValue === 'function') {
        const stored = GM_getValue(modeKey, DEFAULT_MODE);
        if (MODES[stored]) return stored;
      }
    } catch (_) {}
    return DEFAULT_MODE;
  }

  function cycleMode() {
    const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
    try {
      if (typeof GM_setValue === 'function') GM_setValue(modeKey, next);
    } catch (_) {}
    return next;
  }

  // v1.3.0: per-domain opt-out so sites broken by the patches can run untouched.

  function normalizeHost(value) {
    return String(value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  }

  function readExcluded() {
    try {
      if (typeof GM_getValue !== 'function') return [];
      const raw = GM_getValue('lowProfileFingerprint.excludedHosts', '[]');
      const list = Array.isArray(raw) ? raw : JSON.parse(typeof raw === 'string' ? raw : '[]');
      return Array.isArray(list) ? list.map(normalizeHost).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function writeExcluded(list) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue('lowProfileFingerprint.excludedHosts', JSON.stringify(list));
    } catch (_) {}
  }

  function isExcludedHost(current) {
    const target = normalizeHost(current);
    if (!target) return false;
    return readExcluded().some((entry) => target === entry || target.endsWith('.' + entry));
  }

  function toggleExcluded(current) {
    const target = normalizeHost(current);
    if (!target) return false;
    const list = readExcluded();
    const index = list.indexOf(target);
    if (index === -1) list.push(target);
    else list.splice(index, 1);
    writeExcluded(list);
    return index === -1;
  }

  function registerMenu() {
    try {
      if (typeof GM_registerMenuCommand !== 'function') return;
      const currentHost = host();
      GM_registerMenuCommand(SCRIPT_NAME + ': perfil da sessao', () => {
        const lines = [
          SCRIPT_NAME + ' v' + SCRIPT_VERSION,
          '',
          'Site: ' + (currentHost || '(desconhecido)') + (disabledHere ? ' [desativado]' : ' [ativo]'),
          'Modo: ' + mode,
          'Vendor: ' + session.webglVendor,
          'Renderer: ' + session.webglRenderer,
          'Screen: ' + session.width + 'x' + session.height,
          'Timezone: ' + session.timezoneLabel,
          'Diagnostico: ' + diagnostics.length + ' problema(s)',
          '',
          'Patches:',
        ];
        Object.keys(defaults).forEach((patch) => lines.push((readSetting(patch) ? '[on] ' : '[off] ') + labels[patch]));
        root.alert(lines.join('\n'));
      });
      if (currentHost) {
        GM_registerMenuCommand(SCRIPT_NAME + ': ' + (disabledHere ? 'Ativar' : 'Desativar') + ' neste site', () => {
          const nowExcluded = toggleExcluded(currentHost);
          root.alert(SCRIPT_NAME + (nowExcluded ? ' desativado' : ' ativado') + ' em ' + currentHost + '. Recarregue a pagina para aplicar.');
        });
      }
      GM_registerMenuCommand(SCRIPT_NAME + ': modo (' + mode + ')', () => {
        const next = cycleMode();
        root.alert('Modo alterado para ' + next + '. Recarregue a pagina para aplicar.');
      });
      GM_registerMenuCommand(SCRIPT_NAME + ': debug diagnostico (' + (debugMode ? 'on' : 'off') + ')', () => {
        writeDebugMode(!debugMode);
        root.alert('Diagnostico em console ' + (!debugMode ? 'ativado' : 'desativado') + '. Recarregue a pagina para aplicar.');
      });
      GM_registerMenuCommand(SCRIPT_NAME + ': ver diagnostico', () => {
        if (!diagnostics.length) {
          root.alert(SCRIPT_NAME + ': nenhum problema registrado nesta pagina.');
          return;
        }
        const lines = [SCRIPT_NAME + ' diagnostico (' + diagnostics.length + '):'];
        diagnostics.slice(0, 20).forEach((entry, index) => {
          lines.push((index + 1) + '. [' + entry.scope + '] ' + entry.message);
        });
        if (diagnostics.length > 20) lines.push('... +' + (diagnostics.length - 20) + ' item(ns)');
        root.alert(lines.join('\n'));
      });
      Object.keys(defaults).forEach((patch) => {
        GM_registerMenuCommand(SCRIPT_NAME + ': ' + (settings[patch] ? 'Desativar ' : 'Ativar ') + labels[patch], () => {
          const next = !readSetting(patch);
          writeSetting(patch, next);
          root.alert('Patch ' + labels[patch] + ' ' + (next ? 'ativado' : 'desativado') + '. Recarregue a pagina para aplicar.');
        });
      });
    } catch (error) {
      reportIssue('menu:register', error);
    }
  }

  function readDebugMode() {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(DEBUG_KEY, false) === true;
    } catch (error) {
      reportIssue('settings:readDebug', error);
    }
    return false;
  }

  function writeDebugMode(value) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(DEBUG_KEY, Boolean(value));
    } catch (error) {
      reportIssue('settings:writeDebug', error);
    }
  }

  function errorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string' && error.message) return error.message;
    try {
      return String(error);
    } catch (_) {
      return 'Unserializable error';
    }
  }

  function reportIssue(scope, error, detail) {
    const entry = {
      scope: String(scope || 'unknown'),
      message: errorMessage(error),
      detail: detail || null,
      at: Date.now(),
    };
    diagnostics.push(entry);
    if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTICS);
    if (debugModeReady && debugMode && root.console && typeof root.console.warn === 'function') {
      try {
        root.console.warn('[Low-Profile-Fingerprint]', entry.scope, entry.message, entry.detail || '');
      } catch (_) {}
    }
  }

  function defineGetter(target, name, getter) {
    try {
      if (target) Object.defineProperty(target, name, { configurable: true, enumerable: true, get: getter });
    } catch (error) {
      reportIssue('defineGetter:' + name, error);
    }
  }

  function defineMethod(target, name, value) {
    try {
      if (target) Object.defineProperty(target, name, { configurable: true, writable: true, value });
    } catch (error) {
      reportIssue('defineMethod:' + name, error);
    }
  }

  function wrap(target, name, factory) {
    try {
      const original = target && target[name];
      if (typeof original !== 'function' || original[mark]) return;
      const wrapped = factory(original);
      Object.defineProperty(wrapped, mark, { value: true });
      try { Object.defineProperty(wrapped, 'name', { configurable: true, value: original.name || name }); } catch (error) { reportIssue('wrap:name:' + name, error); }
      try { Object.defineProperty(wrapped, 'length', { configurable: true, value: original.length }); } catch (error) { reportIssue('wrap:length:' + name, error); }
      if (nativeSource && fnToString) nativeSource.set(wrapped, fnToString.call(original));
      defineMethod(target, name, wrapped);
    } catch (error) {
      reportIssue('wrap:' + name, error);
    }
  }

  function patchToString() {
    if (!nativeSource || !fnToString || !root.Function || root.Function.prototype.toString[mark]) return;
    const wrapped = function toString() {
      try {
        if (nativeSource.has(this)) return nativeSource.get(this);
      } catch (error) {
        reportIssue('toString:lookup', error);
      }
      return fnToString.call(this);
    };
    try {
      Object.defineProperty(wrapped, mark, { value: true });
      nativeSource.set(wrapped, fnToString.call(fnToString));
    } catch (error) {
      reportIssue('toString:patch', error);
    }
    defineMethod(root.Function.prototype, 'toString', wrapped);
  }

  // REFACTOR v1.2.0: expose bucketed screen values derived from real screen dimensions.
  function patchScreen() {
    const proto = Native.screen || (root.screen && Object.getPrototypeOf(root.screen));
    defineGetter(proto, 'width', () => session.width);
    defineGetter(proto, 'height', () => session.height);
    defineGetter(proto, 'availWidth', () => session.availWidth);
    defineGetter(proto, 'availHeight', () => session.availHeight);
    if (typeof session.colorDepth === 'number') defineGetter(proto, 'colorDepth', () => session.colorDepth);
    if (typeof session.pixelDepth === 'number') defineGetter(proto, 'pixelDepth', () => session.pixelDepth);
  }

  // REFACTOR v1.2.0: build arrays only from real captured entries, without synthetic fallbacks.
  function facade(entries, tag) {
    entries = Array.isArray(entries) ? entries : [];
    const out = {};
    Object.defineProperty(out, Symbol.toStringTag, { value: tag });
    Object.defineProperty(out, 'length', { value: entries.length });
    Object.defineProperty(out, 'item', { value: (index) => entries[index] || null });
    Object.defineProperty(out, 'namedItem', { value: (name) => entries.find((item) => item.name === name || item.type === name) || null });
    entries.forEach((item, index) => {
      const keyValue = item.name || item.type;
      Object.defineProperty(out, index, { value: item, enumerable: true });
      if (keyValue && !Object.prototype.hasOwnProperty.call(out, keyValue)) Object.defineProperty(out, keyValue, { value: item });
    });
    return Object.freeze(out);
  }

  function makeNavigatorCollections() {
    if (typeof Proxy !== 'function') {
      return {
        plugins: facade(session.plugins || [], 'PluginArray'),
        mimeTypes: facade(session.mimeTypes || [], 'MimeTypeArray'),
      };
    }
    const pluginEntries = Array.isArray(session.plugins) ? session.plugins : [];
    const mimeEntries = Array.isArray(session.mimeTypes) ? session.mimeTypes : [];
    const pluginSource = Native.rawPlugins || null;
    const mimeSource = Native.rawMimeTypes || null;
    const pluginProto = pluginSource ? Object.getPrototypeOf(pluginSource) : Object.prototype;
    const mimeProto = mimeSource ? Object.getPrototypeOf(mimeSource) : Object.prototype;
    const pluginByName = Object.create(null);
    const mimeByType = Object.create(null);
    const mimeOwnerByType = Object.create(null);
    const pluginProxyMap = typeof WeakMap === 'function' ? new WeakMap() : null;
    const mimeProxyMap = typeof WeakMap === 'function' ? new WeakMap() : null;

    const resolvedPlugins = pluginEntries.map((entry) => ({
      entry,
      mimes: Array.isArray(entry.mimeTypes) ? entry.mimeTypes.filter((mime) => mime && mime.type) : [],
    }));
    const resolvedMimes = [];

    function bind(value, target) {
      return typeof value === 'function' ? value.bind(target) : value;
    }

    function pluginForMimeName(name) {
      if (!name) return null;
      return pluginByName[name] || null;
    }

    function ensureMimeProxy(mimeEntry, ownerPluginProxy) {
      const source = mimeEntry && mimeEntry.ref;
      if (source && mimeProxyMap && mimeProxyMap.has(source)) return mimeProxyMap.get(source);
      const target = source || Object.create(null);
      const normalizedHas = (prop) => prop === 'type'
        || prop === 'suffixes'
        || prop === 'description'
        || prop === 'enabledPlugin';
      const proxy = new Proxy(target, {
        get(obj, prop) {
          if (prop === 'type') return mimeEntry.type || '';
          if (prop === 'suffixes') return mimeEntry.suffixes || '';
          if (prop === 'description') return mimeEntry.description || '';
          if (prop === 'enabledPlugin') {
            if (mimeEntry.type && mimeOwnerByType[mimeEntry.type]) return mimeOwnerByType[mimeEntry.type];
            if (ownerPluginProxy) return ownerPluginProxy;
            return pluginForMimeName(mimeEntry.enabledPluginName);
          }
          const value = Reflect.get(obj, prop, obj);
          return bind(value, obj);
        },
        has(obj, prop) {
          return normalizedHas(prop);
        },
        ownKeys(obj) {
          return ['type', 'suffixes', 'description', 'enabledPlugin'];
        },
        getOwnPropertyDescriptor(obj, prop) {
          if (!normalizedHas(prop)) return undefined;
          let value;
          if (prop === 'type') value = mimeEntry.type || '';
          else if (prop === 'suffixes') value = mimeEntry.suffixes || '';
          else if (prop === 'description') value = mimeEntry.description || '';
          else if (mimeEntry.type && mimeOwnerByType[mimeEntry.type]) value = mimeOwnerByType[mimeEntry.type];
          else if (ownerPluginProxy) value = ownerPluginProxy;
          else value = pluginForMimeName(mimeEntry.enabledPluginName);
          return { configurable: true, enumerable: false, writable: false, value };
        },
      });
      if (source && mimeProxyMap) mimeProxyMap.set(source, proxy);
      return proxy;
    }

    function ensurePluginProxy(pluginEntry) {
      const source = pluginEntry && pluginEntry.ref;
      if (source && pluginProxyMap && pluginProxyMap.has(source)) return pluginProxyMap.get(source);
      const mimeList = Array.isArray(pluginEntry.mimeTypes) ? pluginEntry.mimeTypes.filter((mime) => mime && mime.type) : [];
      const target = source || Object.create(null);
      let pluginProxy = null;
      const mimeProxyByType = Object.create(null);
      const mimeProxyList = mimeList.map((mimeEntry) => {
        const wrapped = ensureMimeProxy(mimeEntry, null);
        mimeProxyByType[mimeEntry.type] = wrapped;
        return wrapped;
      });
      const hasIndex = (prop) => typeof prop === 'string' && /^\d+$/.test(prop) && Number(prop) < mimeProxyList.length;
      const hasName = (prop) => typeof prop === 'string' && Object.prototype.hasOwnProperty.call(mimeProxyByType, prop);
      const normalizedHas = (prop) => prop === 'name'
        || prop === 'filename'
        || prop === 'description'
        || prop === 'length'
        || prop === 'item'
        || prop === 'namedItem'
        || prop === Symbol.iterator
        || hasIndex(prop)
        || hasName(prop);
      pluginProxy = new Proxy(target, {
        get(obj, prop) {
          if (prop === 'name') return pluginEntry.name || '';
          if (prop === 'filename') return pluginEntry.filename || '';
          if (prop === 'description') return pluginEntry.description || '';
          if (prop === 'length') return mimeProxyList.length;
          if (prop === 'item') return (index) => mimeProxyList[index] || null;
          if (prop === 'namedItem') return (name) => mimeProxyByType[name] || null;
          if (prop === Symbol.iterator) return function* iterator() { for (let i = 0; i < mimeProxyList.length; i += 1) yield mimeProxyList[i]; };
          if (typeof prop === 'string' && /^\d+$/.test(prop)) return mimeProxyList[prop] || null;
          if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(mimeProxyByType, prop)) return mimeProxyByType[prop];
          const value = Reflect.get(obj, prop, obj);
          return bind(value, obj);
        },
        has(obj, prop) {
          return normalizedHas(prop);
        },
        ownKeys(obj) {
          const keys = ['name', 'filename', 'description', 'length', 'item', 'namedItem'];
          for (let i = 0; i < mimeProxyList.length; i += 1) keys.push(String(i));
          Object.keys(mimeProxyByType).forEach((key) => {
            if (keys.indexOf(key) === -1) keys.push(key);
          });
          return keys;
        },
        getOwnPropertyDescriptor(obj, prop) {
          if (!normalizedHas(prop)) return undefined;
          if (prop === 'name') return { configurable: true, enumerable: false, writable: false, value: pluginEntry.name || '' };
          if (prop === 'filename') return { configurable: true, enumerable: false, writable: false, value: pluginEntry.filename || '' };
          if (prop === 'description') return { configurable: true, enumerable: false, writable: false, value: pluginEntry.description || '' };
          if (prop === 'length') return { configurable: true, enumerable: false, writable: false, value: mimeProxyList.length };
          if (prop === 'item') return { configurable: true, enumerable: false, writable: false, value: (index) => mimeProxyList[index] || null };
          if (prop === 'namedItem') return { configurable: true, enumerable: false, writable: false, value: (name) => mimeProxyByType[name] || null };
          if (prop === Symbol.iterator) {
            return {
              configurable: true,
              enumerable: false,
              writable: false,
              value: function* iterator() { for (let i = 0; i < mimeProxyList.length; i += 1) yield mimeProxyList[i]; },
            };
          }
          if (hasIndex(prop)) {
            const index = Number(prop);
            return { configurable: true, enumerable: true, writable: false, value: mimeProxyList[index] || null };
          }
          if (hasName(prop)) return { configurable: true, enumerable: false, writable: false, value: mimeProxyByType[prop] };
          return undefined;
        },
      });
      mimeList.forEach((mimeEntry) => {
        const wrapped = ensureMimeProxy(mimeEntry, pluginProxy);
        mimeProxyByType[mimeEntry.type] = wrapped;
        if (mimeEntry.type && !mimeOwnerByType[mimeEntry.type]) mimeOwnerByType[mimeEntry.type] = pluginProxy;
      });
      if (source && pluginProxyMap) pluginProxyMap.set(source, pluginProxy);
      if (pluginEntry.name && !pluginByName[pluginEntry.name]) pluginByName[pluginEntry.name] = pluginProxy;
      return pluginProxy;
    }

    const pluginProxyList = resolvedPlugins.map(({ entry, mimes }) => {
      entry.mimeTypes = mimes;
      const wrapped = ensurePluginProxy(entry);
      mimes.forEach((mimeEntry) => {
        const mimeProxy = ensureMimeProxy(mimeEntry, wrapped);
        if (mimeEntry.type && !mimeOwnerByType[mimeEntry.type]) mimeOwnerByType[mimeEntry.type] = wrapped;
        if (!mimeByType[mimeEntry.type]) {
          mimeByType[mimeEntry.type] = mimeProxy;
          resolvedMimes.push({ type: mimeEntry.type, proxy: mimeProxy });
        }
      });
      return { entry, proxy: wrapped };
    });

    mimeEntries.forEach((mimeEntry) => {
      if (!mimeEntry || !mimeEntry.type || mimeByType[mimeEntry.type]) return;
      const owner = pluginForMimeName(mimeEntry.enabledPluginName);
      const wrapped = ensureMimeProxy(mimeEntry, owner);
      mimeByType[mimeEntry.type] = wrapped;
      resolvedMimes.push({ type: mimeEntry.type, proxy: wrapped });
    });

    function collectionHas(prop, list, map) {
      if (prop === 'length' || prop === 'item' || prop === 'namedItem' || prop === Symbol.iterator) return true;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) return Number(prop) < list.length;
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(map, prop)) return true;
      return false;
    }

    function collectionOwnKeys(list, map) {
      const keys = ['length', 'item', 'namedItem'];
      for (let i = 0; i < list.length; i += 1) keys.push(String(i));
      Object.keys(map).forEach((name) => keys.push(name));
      return keys;
    }

    function collectionDescriptor(prop, list, map, valueForIndex) {
      if (prop === 'length') return { configurable: true, enumerable: false, value: list.length, writable: false };
      if (prop === 'item') return { configurable: true, enumerable: false, writable: false, value: (index) => valueForIndex(index) };
      if (prop === 'namedItem') return { configurable: true, enumerable: false, writable: false, value: (name) => map[name] || null };
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        const index = Number(prop);
        if (index >= 0 && index < list.length) return { configurable: true, enumerable: true, writable: false, value: valueForIndex(index) };
      }
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(map, prop)) {
        return { configurable: true, enumerable: false, writable: false, value: map[prop] };
      }
      return undefined;
    }

    const pluginArrayProxy = new Proxy(Object.create(pluginProto || Object.prototype), {
      get(target, prop) {
        if (prop === 'length') return pluginProxyList.length;
        if (prop === 'item') return (index) => (pluginProxyList[index] && pluginProxyList[index].proxy) || null;
        if (prop === 'namedItem') return (name) => pluginByName[name] || null;
        if (prop === Symbol.iterator) return function* iterator() { for (let i = 0; i < pluginProxyList.length; i += 1) yield pluginProxyList[i].proxy; };
        if (typeof prop === 'string' && /^\d+$/.test(prop)) return (pluginProxyList[prop] && pluginProxyList[prop].proxy) || null;
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(pluginByName, prop)) return pluginByName[prop];
        const value = Reflect.get(target, prop, target);
        return bind(value, target);
      },
      has(target, prop) {
        return collectionHas(prop, pluginProxyList, pluginByName);
      },
      ownKeys(target) {
        return collectionOwnKeys(pluginProxyList, pluginByName);
      },
      getOwnPropertyDescriptor(target, prop) {
        return collectionDescriptor(prop, pluginProxyList, pluginByName, (index) => (pluginProxyList[index] && pluginProxyList[index].proxy) || null);
      },
      getPrototypeOf(target) {
        return Reflect.getPrototypeOf(target);
      },
    });

    const mimeArrayProxy = new Proxy(Object.create(mimeProto || Object.prototype), {
      get(target, prop) {
        if (prop === 'length') return resolvedMimes.length;
        if (prop === 'item') return (index) => (resolvedMimes[index] && resolvedMimes[index].proxy) || null;
        if (prop === 'namedItem') return (name) => mimeByType[name] || null;
        if (prop === Symbol.iterator) return function* iterator() { for (let i = 0; i < resolvedMimes.length; i += 1) yield resolvedMimes[i].proxy; };
        if (typeof prop === 'string' && /^\d+$/.test(prop)) return (resolvedMimes[prop] && resolvedMimes[prop].proxy) || null;
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(mimeByType, prop)) return mimeByType[prop];
        const value = Reflect.get(target, prop, target);
        return bind(value, target);
      },
      has(target, prop) {
        return collectionHas(prop, resolvedMimes, mimeByType);
      },
      ownKeys(target) {
        return collectionOwnKeys(resolvedMimes, mimeByType);
      },
      getOwnPropertyDescriptor(target, prop) {
        return collectionDescriptor(prop, resolvedMimes, mimeByType, (index) => (resolvedMimes[index] && resolvedMimes[index].proxy) || null);
      },
      getPrototypeOf(target) {
        return Reflect.getPrototypeOf(target);
      },
    });

    return {
      plugins: pluginArrayProxy,
      mimeTypes: mimeArrayProxy,
    };
  }

  // REFACTOR v1.2.0: patch navigator fields with real captured plugin and MIME arrays.
  function patchNavigator() {
    const proto = Native.nav || (root.navigator && Object.getPrototypeOf(root.navigator));
    if (typeof session.hardwareConcurrency === 'number') defineGetter(proto, 'hardwareConcurrency', () => session.hardwareConcurrency);
    if (root.navigator && typeof root.navigator.deviceMemory !== 'undefined') defineGetter(proto, 'deviceMemory', () => session.deviceMemory);
    const collections = makeNavigatorCollections();
    if (root.navigator && typeof root.navigator.plugins !== 'undefined' && collections.plugins) {
      defineGetter(proto, 'plugins', () => collections.plugins);
    }
    if (root.navigator && typeof root.navigator.mimeTypes !== 'undefined' && collections.mimeTypes) {
      defineGetter(proto, 'mimeTypes', () => collections.mimeTypes);
    }
  }

  function patchTimezone() {
    defineMethod(Native.date, 'getTimezoneOffset', function getTimezoneOffset() { return session.timezoneOffset; });
    defineMethod(Native.dtfp, 'resolvedOptions', function resolvedOptions() {
      const options = Native.resolvedOptions.call(this);
      if (options && options.timeZone && session.nativeTimezoneLabel && options.timeZone !== session.nativeTimezoneLabel) return options;
      return Object.assign({}, options, { timeZone: session.timezoneLabel });
    });
  }

  function noiseImageData(imageData, salt) {
    if (!imageData || !imageData.data || imageData.data.length < 4) return imageData;
    const data = imageData.data;
    const pixels = Math.floor(data.length / 4);
    const step = Math.max(1, Math.floor(pixels / cfg.canvasSamples));
    const rand = rng(session.seed + '|canvas|' + salt + '|' + pixels);
    const jitter = randInt(rand, -1, 1);
    for (let pixel = 0; pixel < pixels; pixel += step) {
      const i = pixel * 4;
      data[i] = clamp(data[i] + session.canvasShift[0] + jitter, 0, 255);
      data[i + 1] = clamp(data[i + 1] + session.canvasShift[1] - jitter, 0, 255);
      data[i + 2] = clamp(data[i + 2] + session.canvasShift[2], 0, 255);
    }
    return imageData;
  }

  function noisyCanvas(source, salt) {
    try {
      if (!source.width || !source.height || !Native.createElement) return null;
      const copy = Native.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      const ctx = copy.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(source, 0, 0);
      const w = Math.min(copy.width, 256);
      const h = Math.min(copy.height, 256);
      const data = Native.getImageData.call(ctx, 0, 0, w, h);
      noiseImageData(data, salt);
      Native.putImageData.call(ctx, data, 0, 0);
      return copy;
    } catch (error) {
      reportIssue('canvas:noisyCanvas', error);
      return null;
    }
  }

  function patchCanvas() {
    if (!Native.canvas || !Native.c2d || !Native.getImageData) return;
    wrap(Native.c2d, 'getImageData', (original) => function getImageData(...args) { return noiseImageData(original.apply(this, args), 'getImageData'); });
    wrap(Native.canvas, 'toDataURL', (original) => function toDataURL(...args) {
      const copy = noisyCanvas(this, 'toDataURL');
      return copy ? Native.toDataURL.apply(copy, args) : original.apply(this, args);
    });
    wrap(Native.canvas, 'toBlob', (original) => function toBlob(...args) {
      const copy = noisyCanvas(this, 'toBlob');
      return copy ? Native.toBlob.apply(copy, args) : original.apply(this, args);
    });
  }

  function patchFonts() {
    if (!Native.c2d || !Native.measureText) return;
    wrap(Native.c2d, 'measureText', (original) => function measureText(...args) {
      const result = original.apply(this, args);
      const width = result && typeof result.width === 'number' ? result.width + (rng(session.seed + '|font|' + this.font + '|' + args[0])() - 0.5) : null;
      if (width === null || typeof Proxy !== 'function') return result;
      return new Proxy(result, { get: (target, prop) => (prop === 'width' ? Math.max(0, width) : Reflect.get(target, prop, target)) });
    });
  }

  // v1.4.0: jitter only rect dimensions sub-pixel, keeping x/y/top/left so layout reads stay stable.
  function noisyRect(rect, salt) {
    if (!rect || typeof Proxy !== 'function' || cfg.rectScale <= 0) return rect;
    const delta = (axis, value) => (rng(session.seed + '|rect|' + salt + '|' + axis + '|' + Math.round(value))() - 0.5) * cfg.rectScale;
    const dw = delta('w', rect.width);
    const dh = delta('h', rect.height);
    const overrides = {
      width: Math.max(0, rect.width + dw),
      height: Math.max(0, rect.height + dh),
      right: rect.right + dw,
      bottom: rect.bottom + dh,
    };
    return new Proxy(rect, {
      get(target, prop) {
        if (Object.prototype.hasOwnProperty.call(overrides, prop)) return overrides[prop];
        if (prop === 'toJSON') return () => Object.assign({ x: target.x, y: target.y, top: target.top, left: target.left }, overrides);
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  function patchClientRects() {
    const proto = Native.element;
    if (!proto || typeof Proxy !== 'function' || cfg.rectScale <= 0) return;
    wrap(proto, 'getBoundingClientRect', (original) => function getBoundingClientRect(...args) {
      return noisyRect(original.apply(this, args), 'bcr');
    });
    wrap(proto, 'getClientRects', (original) => function getClientRects(...args) {
      const list = original.apply(this, args);
      if (!list || typeof list.length !== 'number') return list;
      const rects = Array.prototype.map.call(list, (rect, index) => noisyRect(rect, 'cr|' + index));
      let proxy = null;
      const iterable = function* iterator() {
        for (let i = 0; i < rects.length; i += 1) yield rects[i];
      };
      const listForEach = (callback, thisArg) => {
        for (let i = 0; i < rects.length; i += 1) callback.call(thisArg, rects[i], i, proxy);
      };
      proxy = new Proxy(list, {
        get(target, prop) {
          if (prop === 'item') return (index) => rects[index] || null;
          if (prop === Symbol.iterator) return iterable;
          if (prop === 'forEach') return listForEach;
          if (prop === 'values') return () => iterable();
          if (prop === 'keys') return () => rects.map((_, index) => index)[Symbol.iterator]();
          if (prop === 'entries') return () => rects.map((rect, index) => [index, rect])[Symbol.iterator]();
          if (typeof prop === 'string' && /^\d+$/.test(prop)) return rects[prop];
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      return proxy;
    });
  }

  // REFACTOR v1.2.0: bucket real NetworkInformation values without inventing a connection profile.
  function patchConnection() {
    const connection = root.navigator && (root.navigator.connection || root.navigator.mozConnection || root.navigator.webkitConnection);
    if (!connection || !session.connection) return;
    [Native.connection, connection && Object.getPrototypeOf(connection), connection].forEach((target) => {
      if (typeof session.connection.rtt === 'number') defineGetter(target, 'rtt', () => session.connection.rtt);
      if (typeof session.connection.downlink === 'number') defineGetter(target, 'downlink', () => session.connection.downlink);
      if (typeof session.connection.type === 'string') defineGetter(target, 'type', () => session.connection.type);
      if (typeof session.connection.effectiveType === 'string') defineGetter(target, 'effectiveType', () => session.connection.effectiveType);
    });
  }

  // REFACTOR v1.2.0: keep only real installed voices and remove the fixed cap.
  function patchSpeech() {
    const speech = root.speechSynthesis;
    if (!speech || typeof speech.getVoices !== 'function') return;
    const normalize = (voices) => Array.prototype.slice.call(voices || [])
      .map((voice, index) => ({ voice, index, rank: hash(session.seed + '|voice|' + [voice.name, voice.lang, voice.voiceURI].join('|')) }))
      .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
      .map((entry) => entry.voice);
    wrap(Native.speech || Object.getPrototypeOf(speech), 'getVoices', (original) => function getVoices(...args) { return normalize(original.apply(this, args)); });
  }

  function patchBattery() {
    const target = Native.nav && Native.nav.getBattery ? Native.nav : root.navigator;
    if (!target || typeof target.getBattery !== 'function' || typeof Proxy !== 'function') return;
    const batteryProxy = (battery) => new Proxy(battery, {
      get(obj, prop) {
        if (prop === 'level') return Number(clamp(bucket(obj.level, 0.1), 0, 1).toFixed(1));
        if (prop === 'charging') return true;
        if (prop === 'chargingTime') return 0;
        if (prop === 'dischargingTime') return Infinity;
        const value = Reflect.get(obj, prop, obj);
        return typeof value === 'function' ? value.bind(obj) : value;
      },
    });
    wrap(target, 'getBattery', (original) => function getBattery(...args) {
      const result = original.apply(this, args);
      return result && typeof result.then === 'function' ? result.then(batteryProxy) : batteryProxy(result);
    });
  }

  // REFACTOR v1.2.0: return normalized real VENDOR/RENDERER values instead of synthetic hardware strings.
  function patchWebGL() {
    const debugInfoByContext = typeof WeakMap === 'function' ? new WeakMap() : null;
    const withState = (ctx) => {
      if (!debugInfoByContext || !ctx) return { supported: false, enabled: false, vendorEnum: 37445, rendererEnum: 37446 };
      if (!debugInfoByContext.has(ctx)) debugInfoByContext.set(ctx, { supported: false, enabled: false, vendorEnum: 37445, rendererEnum: 37446 });
      return debugInfoByContext.get(ctx);
    };
    const isDebugInfoName = (name) => typeof name === 'string' && name.toUpperCase() === 'WEBGL_DEBUG_RENDERER_INFO';
    [[Native.gl1, Native.gl1GetParameter], [Native.gl2, Native.gl2GetParameter]].forEach(([proto]) => {
      if (!proto) return;
      wrap(proto, 'getSupportedExtensions', (original) => function getSupportedExtensions(...args) {
        const list = original.apply(this, args);
        try {
          const state = withState(this);
          if (Array.isArray(list) && list.some((name) => isDebugInfoName(name))) state.supported = true;
        } catch (error) {
          reportIssue('webgl:getSupportedExtensions', error);
        }
        return list;
      });
      wrap(proto, 'getExtension', (original) => function getExtension(name, ...args) {
        const extension = original.call(this, name, ...args);
        if (!isDebugInfoName(name)) return extension;
        const state = withState(this);
        state.supported = Boolean(extension);
        state.enabled = Boolean(extension);
        if (extension && typeof extension === 'object') {
          state.vendorEnum = typeof extension.UNMASKED_VENDOR_WEBGL === 'number' ? extension.UNMASKED_VENDOR_WEBGL : 37445;
          state.rendererEnum = typeof extension.UNMASKED_RENDERER_WEBGL === 'number' ? extension.UNMASKED_RENDERER_WEBGL : 37446;
        }
        return extension;
      });
      wrap(proto, 'getParameter', (original) => function getParameter(parameter) {
        const vendorParameter = this && typeof this.VENDOR !== 'undefined' ? this.VENDOR : 7936;
        const rendererParameter = this && typeof this.RENDERER !== 'undefined' ? this.RENDERER : 7937;
        const state = withState(this);
        const debugVendor = state && state.enabled ? state.vendorEnum : null;
        const debugRenderer = state && state.enabled ? state.rendererEnum : null;
        if (parameter === vendorParameter && session.webglVendor) return session.webglVendor;
        if (parameter === rendererParameter && session.webglRenderer) return session.webglRenderer;
        if (debugVendor !== null && parameter === debugVendor && session.webglVendor) return session.webglVendor;
        if (debugRenderer !== null && parameter === debugRenderer && session.webglRenderer) return session.webglRenderer;
        if (parameter === this.MAX_TEXTURE_SIZE) return clamp(bucket(original.call(this, parameter), 512), 2048, 16384);
        return original.call(this, parameter);
      });
    });
  }

  function patchWebGLPixels() {
    [[Native.gl1, Native.gl1ReadPixels], [Native.gl2, Native.gl2ReadPixels]].forEach(([proto]) => {
      if (!proto) return;
      wrap(proto, 'readPixels', (original) => function readPixels(...args) {
        const result = original.apply(this, args);
        const pixels = args[6];
        if (pixels && typeof pixels.length === 'number') typedNoise(pixels, session.seed + '|webgl|' + args.slice(2, 6).join('|'), cfg.glScale, 128);
        return result;
      });
    });
  }

  function typedNoise(data, salt, scale, samples) {
    const rand = rng(salt + '|' + data.length);
    const step = Math.max(1, Math.floor(data.length / samples));
    for (let i = 0; i < data.length; i += step) {
      const current = Number(data[i]);
      if (!Number.isFinite(current)) continue;
      const delta = (rand() - 0.5) * scale;
      data[i] = data instanceof Float32Array || data instanceof Float64Array ? current + delta * 0.00001 : clamp(current + Math.round(delta), 0, 255);
    }
    return data;
  }

  function patchAudio() {
    if (Native.audioBuffer && Native.getChannelData) {
      wrap(Native.audioBuffer, 'getChannelData', (original) => function getChannelData(...args) {
        const data = original.apply(this, args);
        if (!audioSeen || !audioSeen.has(data)) {
          typedNoise(data, session.seed + '|audioBuffer|' + this.length + '|' + args[0], 0.000003 * cfg.audioScale, 128);
          try { if (audioSeen) audioSeen.add(data); } catch (error) { reportIssue('audio:cache', error); }
        }
        return data;
      });
    }
    if (Native.analyser && Native.getFloatFrequencyData) {
      wrap(Native.analyser, 'getFloatFrequencyData', (original) => function getFloatFrequencyData(...args) {
        const result = original.apply(this, args);
        typedNoise(args[0], session.seed + '|analyser', 0.0001 * cfg.audioScale, 128);
        return result;
      });
    }
  }
})();
