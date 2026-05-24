// ==UserScript==
// @name         Low-Profile-Fingerprint
// @namespace    https://github.com/Devzinh/Low-Profile-Fingerprint
// @version      1.1.0
// @description  Disfarca seu navegador: normaliza sinais comuns de fingerprint e adiciona ruido leve por sessao para reduzir rastreamento sem quebrar sites.
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
  const SCRIPT_VERSION = '1.1.0';
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

  patchToString();
  registerMenu();
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

  function capture(win) {
    const canvas = win.HTMLCanvasElement && win.HTMLCanvasElement.prototype;
    const c2d = win.CanvasRenderingContext2D && win.CanvasRenderingContext2D.prototype;
    const gl1 = win.WebGLRenderingContext && win.WebGLRenderingContext.prototype;
    const gl2 = win.WebGL2RenderingContext && win.WebGL2RenderingContext.prototype;
    const dtf = win.Intl && win.Intl.DateTimeFormat;
    return {
      screen: win.Screen && win.Screen.prototype,
      nav: win.Navigator && win.Navigator.prototype,
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

  function makeProfile(seed) {
    const rand = rng(seed + '|' + host());
    const screen = root.screen || {};
    const nav = root.navigator || {};
    const width = clamp(bucket(screen.width || 1920, 64), 1024, 3840);
    const height = clamp(bucket(screen.height || 1080, 64), 720, 2160);
    const offset = realTimezoneOffset();
    return {
      seed,
      width,
      height,
      availWidth: width - (8 + Math.floor(rand() * 24)),
      availHeight: height - (32 + Math.floor(rand() * 40)),
      colorDepth: 24,
      pixelDepth: 24,
      timezoneOffset: offset,
      timezoneLabel: timezoneForOffset(offset, seed),
      nativeTimezoneLabel: nativeTimezoneLabel(),
      hardwareConcurrency: clamp(bucket(nav.hardwareConcurrency || 8, 2), 2, 16),
      deviceMemory: typeof nav.deviceMemory === 'number' ? clamp(bucket(nav.deviceMemory, 2), 2, 16) : undefined,
      canvasShift: [randInt(rand, -2, 2) || 1, randInt(rand, -2, 2), randInt(rand, -2, 2)],
      webglVendor: pick(rand, ['Google Inc.', 'Google Inc. (Intel)', 'Google Inc. (NVIDIA)']),
      webglRenderer: pick(rand, [
        'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0)',
        'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0)',
        'ANGLE (AMD, AMD Radeon Graphics Direct3D11 vs_5_0 ps_5_0)',
      ]),
      connection: {
        rtt: pick(rand, [50, 75, 100, 125, 150]),
        downlink: pick(rand, [1.5, 3, 5, 7.5, 10]),
        type: pick(rand, ['wifi', 'ethernet', 'cellular', 'unknown']),
        effectiveType: pick(rand, ['3g', '4g']),
      },
    };
  }

  function randInt(rand, min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
  }

  function pick(rand, values) {
    return values[Math.floor(rand() * values.length) % values.length];
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

  function timezoneForOffset(offset, seed) {
    let zones = ['UTC'];
    try {
      if (Native.supportedValuesOf) zones = Native.supportedValuesOf('timeZone');
    } catch (_) {}
    const now = new Native.DateCtor();
    const matches = Array.from(zones).filter((zone) => offsetForZone(zone, now) === offset);
    return pick(rng(seed + '|timezone'), matches.length ? matches : ['UTC']);
  }

  function offsetForZone(zone, date) {
    try {
      const parts = new Native.dtf('en-US-u-ca-gregory-nu-latn', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});
      const utc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour === 24 ? 0 : +parts.hour, +parts.minute, +parts.second);
      return -Math.round((utc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
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

  function registerMenu() {
    try {
      if (typeof GM_registerMenuCommand !== 'function') return;
      GM_registerMenuCommand(SCRIPT_NAME + ': perfil da sessao', () => {
        const lines = [
          SCRIPT_NAME + ' v' + SCRIPT_VERSION,
          '',
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

  function patchScreen() {
    const proto = Native.screen || (root.screen && Object.getPrototypeOf(root.screen));
    defineGetter(proto, 'width', () => session.width);
    defineGetter(proto, 'height', () => session.height);
    defineGetter(proto, 'availWidth', () => session.availWidth);
    defineGetter(proto, 'availHeight', () => session.availHeight);
    defineGetter(proto, 'colorDepth', () => session.colorDepth);
    defineGetter(proto, 'pixelDepth', () => session.pixelDepth);
  }

  function facade(entries, tag) {
    const out = {};
    Object.defineProperty(out, Symbol.toStringTag, { value: tag });
    Object.defineProperty(out, 'length', { value: entries.length });
    Object.defineProperty(out, 'item', { value: (index) => entries[index] || null });
    Object.defineProperty(out, 'namedItem', { value: (name) => entries.find((item) => item.name === name || item.type === name) || null });
    entries.forEach((item, index) => {
      Object.defineProperty(out, index, { value: Object.freeze(item), enumerable: true });
      Object.defineProperty(out, item.name || item.type, { value: item });
    });
    return Object.freeze(out);
  }

  function patchNavigator() {
    const proto = Native.nav || (root.navigator && Object.getPrototypeOf(root.navigator));
    defineGetter(proto, 'hardwareConcurrency', () => session.hardwareConcurrency);
    if (root.navigator && typeof root.navigator.deviceMemory !== 'undefined') defineGetter(proto, 'deviceMemory', () => session.deviceMemory);
    defineGetter(proto, 'plugins', () => facade([
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format' },
      { name: 'Widevine Content Decryption Module', filename: 'widevinecdm', description: 'Content Decryption Module' },
    ], 'PluginArray'));
    defineGetter(proto, 'mimeTypes', () => facade([
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    ], 'MimeTypeArray'));
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

  function patchConnection() {
    const connection = root.navigator && (root.navigator.connection || root.navigator.mozConnection || root.navigator.webkitConnection);
    [Native.connection, connection && Object.getPrototypeOf(connection), connection].forEach((target) => {
      defineGetter(target, 'rtt', () => session.connection.rtt);
      defineGetter(target, 'downlink', () => session.connection.downlink);
      defineGetter(target, 'type', () => session.connection.type);
      defineGetter(target, 'effectiveType', () => session.connection.effectiveType);
    });
  }

  function patchSpeech() {
    const speech = root.speechSynthesis;
    if (!speech || typeof speech.getVoices !== 'function') return;
    const normalize = (voices) => Array.prototype.slice.call(voices || [])
      .map((voice, index) => ({ voice, index, rank: hash(session.seed + '|voice|' + [voice.name, voice.lang, voice.voiceURI].join('|')) }))
      .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
      .slice(0, 3)
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

  function patchWebGL() {
    [[Native.gl1, Native.gl1GetParameter], [Native.gl2, Native.gl2GetParameter]].forEach(([proto]) => {
      if (!proto) return;
      wrap(proto, 'getParameter', (original) => function getParameter(parameter) {
        const debug = this.getExtension && this.getExtension('WEBGL_debug_renderer_info');
        if (debug && parameter === debug.UNMASKED_VENDOR_WEBGL) return session.webglVendor;
        if (debug && parameter === debug.UNMASKED_RENDERER_WEBGL) return session.webglRenderer;
        if (parameter === 37445) return session.webglVendor;
        if (parameter === 37446) return session.webglRenderer;
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
