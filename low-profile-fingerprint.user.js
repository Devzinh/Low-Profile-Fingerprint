// ==UserScript==
// @name         Low-Profile-Fingerprint
// @namespace    https://github.com/Devzinh/Low-Profile-Fingerprint
// @version      1.3.0
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
  const SCRIPT_VERSION = '1.3.0';
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
    connection: 'NetworkInformation',
    speech: 'Speech voices',
    battery: 'Battery API',
    webgl: 'WebGL',
    webglPixels: 'WebGL pixel buffer',
    audio: 'Audio',
  });
  const Native = capture(root);
  const settings = Object.keys(defaults).reduce((acc, key) => {
    acc[key] = readSetting(key);
    return acc;
  }, {});
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
      ['connection', patchConnection],
      ['speech', patchSpeech],
      ['battery', patchBattery],
      ['webgl', patchWebGL],
      ['webglPixels', patchWebGLPixels],
      ['audio', patchAudio],
    ].forEach(([key, patch]) => {
      if (!settings[key]) return;
      try { patch(); } catch (_) {}
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
          name: normalizedText(plugin.name, 120),
          filename: normalizedText(plugin.filename, 160),
          description: normalizedText(plugin.description, 200),
        };
        if (entry.name || entry.filename || entry.description) entries.push(entry);
      }
      return uniqueEntries(entries, (entry) => [entry.name, entry.filename, entry.description].join('|'));
    } catch (_) {
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
          type: normalizedText(mimeType.type, 120),
          suffixes: normalizedText(mimeType.suffixes, 120),
          description: normalizedText(mimeType.description, 200),
        };
        if (entry.type) entries.push(entry);
      }
      return uniqueEntries(entries, (entry) => [entry.type, entry.suffixes, entry.description].join('|'));
    } catch (_) {
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
    const width = Math.max(0, bucket(screen.width, 64));
    const height = Math.max(0, bucket(screen.height, 64));
    const availWidth = Math.min(width, Math.max(0, finiteBucket(screen.availWidth, 64) || width));
    const availHeight = Math.min(height, Math.max(0, finiteBucket(screen.availHeight, 64) || height));
    const colorDepth = finiteBucket(screen.colorDepth, 1);
    const pixelDepth = finiteBucket(screen.pixelDepth, 1);
    const hardwareConcurrency = finiteBucket(nav.hardwareConcurrency, 2);
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
      canvasShift: [randInt(rand, -2, 2) || 1, randInt(rand, -2, 2), randInt(rand, -2, 2)],
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
          'Vendor: ' + session.webglVendor,
          'Renderer: ' + session.webglRenderer,
          'Screen: ' + session.width + 'x' + session.height,
          'Timezone: ' + session.timezoneLabel,
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
      Object.keys(defaults).forEach((patch) => {
        GM_registerMenuCommand(SCRIPT_NAME + ': ' + (settings[patch] ? 'Desativar ' : 'Ativar ') + labels[patch], () => {
          const next = !readSetting(patch);
          writeSetting(patch, next);
          root.alert('Patch ' + labels[patch] + ' ' + (next ? 'ativado' : 'desativado') + '. Recarregue a pagina para aplicar.');
        });
      });
    } catch (_) {}
  }

  function defineGetter(target, name, getter) {
    try {
      if (target) Object.defineProperty(target, name, { configurable: true, enumerable: true, get: getter });
    } catch (_) {}
  }

  function defineMethod(target, name, value) {
    try {
      if (target) Object.defineProperty(target, name, { configurable: true, writable: true, value });
    } catch (_) {}
  }

  function wrap(target, name, factory) {
    try {
      const original = target && target[name];
      if (typeof original !== 'function' || original[mark]) return;
      const wrapped = factory(original);
      Object.defineProperty(wrapped, mark, { value: true });
      try { Object.defineProperty(wrapped, 'name', { configurable: true, value: original.name || name }); } catch (_) {}
      try { Object.defineProperty(wrapped, 'length', { configurable: true, value: original.length }); } catch (_) {}
      if (nativeSource && fnToString) nativeSource.set(wrapped, fnToString.call(original));
      defineMethod(target, name, wrapped);
    } catch (_) {}
  }

  function patchToString() {
    if (!nativeSource || !fnToString || !root.Function || root.Function.prototype.toString[mark]) return;
    const wrapped = function toString() {
      try {
        if (nativeSource.has(this)) return nativeSource.get(this);
      } catch (_) {}
      return fnToString.call(this);
    };
    try { Object.defineProperty(wrapped, mark, { value: true }); nativeSource.set(wrapped, fnToString.call(fnToString)); } catch (_) {}
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
      const frozen = Object.freeze(Object.assign({}, item));
      const keyValue = item.name || item.type;
      Object.defineProperty(out, index, { value: frozen, enumerable: true });
      if (keyValue && !Object.prototype.hasOwnProperty.call(out, keyValue)) Object.defineProperty(out, keyValue, { value: frozen });
    });
    return Object.freeze(out);
  }

  // REFACTOR v1.2.0: patch navigator fields with real captured plugin and MIME arrays.
  function patchNavigator() {
    const proto = Native.nav || (root.navigator && Object.getPrototypeOf(root.navigator));
    if (typeof session.hardwareConcurrency === 'number') defineGetter(proto, 'hardwareConcurrency', () => session.hardwareConcurrency);
    if (root.navigator && typeof root.navigator.deviceMemory !== 'undefined') defineGetter(proto, 'deviceMemory', () => session.deviceMemory);
    if (root.navigator && typeof root.navigator.plugins !== 'undefined' && Array.isArray(session.plugins)) {
      defineGetter(proto, 'plugins', () => facade(session.plugins, 'PluginArray'));
    }
    if (root.navigator && typeof root.navigator.mimeTypes !== 'undefined' && Array.isArray(session.mimeTypes)) {
      defineGetter(proto, 'mimeTypes', () => facade(session.mimeTypes, 'MimeTypeArray'));
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
    const step = Math.max(1, Math.floor(pixels / 96));
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
    } catch (_) {
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
    [[Native.gl1, Native.gl1GetParameter], [Native.gl2, Native.gl2GetParameter]].forEach(([proto]) => {
      if (!proto) return;
      wrap(proto, 'getParameter', (original) => function getParameter(parameter) {
        const vendorParameter = this && typeof this.VENDOR !== 'undefined' ? this.VENDOR : 7936;
        const rendererParameter = this && typeof this.RENDERER !== 'undefined' ? this.RENDERER : 7937;
        if ((parameter === vendorParameter || parameter === 37445) && session.webglVendor) return session.webglVendor;
        if ((parameter === rendererParameter || parameter === 37446) && session.webglRenderer) return session.webglRenderer;
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
        if (pixels && typeof pixels.length === 'number') typedNoise(pixels, session.seed + '|webgl|' + args.slice(2, 6).join('|'), 1, 128);
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
          typedNoise(data, session.seed + '|audioBuffer|' + this.length + '|' + args[0], 0.000003, 128);
          try { if (audioSeen) audioSeen.add(data); } catch (_) {}
        }
        return data;
      });
    }
    if (Native.analyser && Native.getFloatFrequencyData) {
      wrap(Native.analyser, 'getFloatFrequencyData', (original) => function getFloatFrequencyData(...args) {
        const result = original.apply(this, args);
        typedNoise(args[0], session.seed + '|analyser', 0.0001, 128);
        return result;
      });
    }
  }
})();
