// ==UserScript==
// @name         Low-Profile Fingerprint
// @namespace    https://www.linkedin.com/in/ronygabrieloliveira/
// @version      1.0.0
// @description  Disfarça seu navegador: normaliza vários sinais de fingerprint (screen, navigator, timezone, canvas, WebGL, etc.) e adiciona ruído leve por sessão para reduzir rastreamento sem quebrar sites.
// @author       Rony Gabriel
// @match        *://*/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const root = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : window;
  const Native = captureNativeRefs(root);
  const seed = createSessionSeed(root);
  const PATCH_DEFAULTS = Object.freeze({
    screen: true,
    navigator: true,
    timezone: true,
    canvas: true,
    fonts: true,
    connection: true,
    speech: true,
    battery: true,
    webgl: true,
  });
  const PATCH_LABELS = Object.freeze({
    screen: 'Screen',
    navigator: 'Navigator',
    timezone: 'Timezone',
    canvas: 'Canvas',
    fonts: 'Fonts',
    connection: 'NetworkInformation',
    speech: 'Speech voices',
    battery: 'Battery API',
    webgl: 'WebGL',
  });
  const settings = loadPatchSettings();
  const session = buildSessionProfile(seed);

  registerMenuCommands();
  applyEnabledPatches();

  function captureNativeRefs(win) {
    const HTMLCanvas = win.HTMLCanvasElement;
    const Canvas2D = win.CanvasRenderingContext2D;
    const WebGL1 = win.WebGLRenderingContext;
    const WebGL2 = win.WebGL2RenderingContext;
    const NavigatorCtor = win.Navigator;
    const ScreenCtor = win.Screen;
    const DateCtor = win.Date || Date;
    const IntlObj = win.Intl || Intl;
    const DateTimeFormat = IntlObj && IntlObj.DateTimeFormat;

    return {
      HTMLCanvasElementPrototype: HTMLCanvas && HTMLCanvas.prototype,
      CanvasRenderingContext2DPrototype: Canvas2D && Canvas2D.prototype,
      WebGLRenderingContextPrototype: WebGL1 && WebGL1.prototype,
      WebGL2RenderingContextPrototype: WebGL2 && WebGL2.prototype,
      NavigatorPrototype: NavigatorCtor && NavigatorCtor.prototype,
      ScreenPrototype: ScreenCtor && ScreenCtor.prototype,
      SpeechSynthesisPrototype: win.SpeechSynthesis && win.SpeechSynthesis.prototype,
      BatteryManagerPrototype: win.BatteryManager && win.BatteryManager.prototype,
      NetworkInformationPrototype: win.NetworkInformation && win.NetworkInformation.prototype,
      DatePrototype: DateCtor && DateCtor.prototype,
      DateCtor,
      DateTimeFormat,
      DateTimeFormatPrototype: DateTimeFormat && DateTimeFormat.prototype,
      supportedValuesOf: IntlObj && typeof IntlObj.supportedValuesOf === 'function'
        ? IntlObj.supportedValuesOf.bind(IntlObj)
        : null,
      toDataURL: HTMLCanvas && HTMLCanvas.prototype && HTMLCanvas.prototype.toDataURL,
      toBlob: HTMLCanvas && HTMLCanvas.prototype && HTMLCanvas.prototype.toBlob,
      getImageData: Canvas2D && Canvas2D.prototype && Canvas2D.prototype.getImageData,
      putImageData: Canvas2D && Canvas2D.prototype && Canvas2D.prototype.putImageData,
      measureText: Canvas2D && Canvas2D.prototype && Canvas2D.prototype.measureText,
      webglGetParameter: WebGL1 && WebGL1.prototype && WebGL1.prototype.getParameter,
      webgl2GetParameter: WebGL2 && WebGL2.prototype && WebGL2.prototype.getParameter,
      getTimezoneOffset: DateCtor && DateCtor.prototype && DateCtor.prototype.getTimezoneOffset,
      resolvedOptions: DateTimeFormat && DateTimeFormat.prototype && DateTimeFormat.prototype.resolvedOptions,
      createElement: win.document && typeof win.document.createElement === 'function'
        ? win.document.createElement.bind(win.document)
        : document.createElement.bind(document),
    };
  }

  function createSessionSeed(win) {
    const storageKey = '__no_fingerprint_session_seed__';
    try {
      const storage = win.sessionStorage;
      const existing = storage && storage.getItem(storageKey);
      if (existing) return existing;
      const next = createRandomSeed(win);
      if (storage) storage.setItem(storageKey, next);
      return next;
    } catch (_) {
      return createRandomSeed(win);
    }
  }

  function createRandomSeed(win) {
    const array = new Uint32Array(4);
    const cryptoRef = win.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
      cryptoRef.getRandomValues(array);
      return Array.from(array).join('-');
    }
    return [
      Date.now(),
      Math.random(),
      getHostname().length,
    ].join('-');
  }

  function hashString(input) {
    let hash = 2166136261;
    const value = String(input);
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function rngFactory(input) {
    let state = hashString(input) || 1;
    return function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) % 1000000) / 1000000;
    };
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function roundBucket(value, step) {
    const number = Number(value);
    if (!Number.isFinite(number) || !step) return 0;
    return Math.round(number / step) * step;
  }

  function randomInt(rand, min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
  }

  function pickValue(rand, list) {
    if (!list || !list.length) return undefined;
    return list[Math.floor(rand() * list.length) % list.length];
  }

  function getHostname() {
    try {
      return (root.location && root.location.hostname) || location.hostname || '';
    } catch (_) {
      return '';
    }
  }

  function buildSessionProfile(seedValue) {
    const rand = rngFactory(seedValue + '|' + getHostname());
    const screenRef = root.screen || {};
    const navigatorRef = root.navigator || {};
    const baseWidth = Number(screenRef.width) || 1920;
    const baseHeight = Number(screenRef.height) || 1080;
    const normalizedWidth = clamp(roundBucket(baseWidth, 64), 1024, 3840);
    const normalizedHeight = clamp(roundBucket(baseHeight, 64), 720, 2160);
    const availPadW = 8 + Math.floor(rand() * 24);
    const availPadH = 32 + Math.floor(rand() * 40);
    const realTimezoneOffset = getRealTimezoneOffset();
    const timezoneLabel = pickTimezoneForOffset(realTimezoneOffset, seedValue);
    const hardware = clamp(roundBucket(navigatorRef.hardwareConcurrency || 8, 2), 2, 16);
    const deviceMemory = typeof navigatorRef.deviceMemory === 'number'
      ? clamp(roundBucket(navigatorRef.deviceMemory, 2), 2, 16)
      : undefined;

    return {
      rand,
      seed: seedValue,
      width: normalizedWidth,
      height: normalizedHeight,
      availWidth: normalizedWidth - availPadW,
      availHeight: normalizedHeight - availPadH,
      colorDepth: 24,
      pixelDepth: 24,
      timezoneOffset: realTimezoneOffset,
      timezoneLabel,
      hardwareConcurrency: hardware,
      deviceMemory,
      canvasShift: makeCanvasShift(rand),
      webglVendor: pickValue(rand, [
        'Google Inc.',
        'Google Inc. (NVIDIA)',
        'Google Inc. (Intel)',
      ]),
      webglRenderer: pickValue(rand, [
        'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0)',
        'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0)',
        'ANGLE (AMD, AMD Radeon Graphics Direct3D11 vs_5_0 ps_5_0)',
      ]),
      connection: {
        rtt: pickValue(rand, [50, 75, 100, 125, 150]),
        downlink: pickValue(rand, [1.5, 3, 5, 7.5, 10]),
        type: pickValue(rand, ['wifi', 'ethernet', 'cellular', 'unknown']),
        effectiveType: pickValue(rand, ['3g', '4g']),
      },
      plugins: makePluginArray(),
      mimeTypes: makeMimeTypeArray(),
    };
  }

  function makeCanvasShift(rand) {
    const shift = {
      r: randomInt(rand, -2, 2),
      g: randomInt(rand, -2, 2),
      b: randomInt(rand, -2, 2),
      a: 0,
    };
    if (shift.r === 0 && shift.g === 0 && shift.b === 0) shift.r = 1;
    return shift;
  }

  function getRealTimezoneOffset() {
    try {
      if (Native.getTimezoneOffset && Native.DateCtor) {
        return Native.getTimezoneOffset.call(new Native.DateCtor());
      }
    } catch (_) {}

    return new Date().getTimezoneOffset();
  }

  function getSupportedTimeZones() {
    try {
      if (Native.supportedValuesOf) {
        const values = Native.supportedValuesOf('timeZone');
        if (values && values.length) return Array.from(values);
      }
    } catch (_) {}

    return ['UTC'];
  }

  function pickTimezoneForOffset(offsetMinutes, seedValue) {
    const zones = getSupportedTimeZones();
    if (zones.length === 1 && zones[0] === 'UTC') return 'UTC';

    const now = Native.DateCtor ? new Native.DateCtor() : new Date();
    const matches = zones.filter((timeZone) => {
      const zoneOffset = getTimezoneOffsetForZone(timeZone, now);
      return zoneOffset === offsetMinutes;
    });

    return pickValue(rngFactory(seedValue + '|timezone'), matches.length ? matches : ['UTC']);
  }

  function getTimezoneOffsetForZone(timeZone, date) {
    try {
      if (!Native.DateTimeFormat) return null;
      const formatter = new Native.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      const parts = formatter.formatToParts(date);
      const values = {};
      parts.forEach((part) => {
        if (part.type !== 'literal') values[part.type] = part.value;
      });

      const year = Number(values.year);
      const month = Number(values.month);
      const day = Number(values.day);
      const hour = Number(values.hour);
      const minute = Number(values.minute);
      const second = Number(values.second);

      if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;

      const asUTC = Date.UTC(year, month - 1, day, hour === 24 ? 0 : hour, minute, second);
      const dateUTC = Math.floor(date.getTime() / 1000) * 1000;
      return -Math.round((asUTC - dateUTC) / 60000);
    } catch (_) {
      return null;
    }
  }

  function makePluginArray() {
    const entries = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format' },
      { name: 'Widevine Content Decryption Module', filename: 'widevinecdm', description: 'Content Decryption Module' },
    ];
    return createIndexedFacade(entries, 'PluginArray');
  }

  function makeMimeTypeArray() {
    const entries = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    ];
    return createIndexedFacade(entries, 'MimeTypeArray');
  }

  function createIndexedFacade(entries, tag) {
    const items = entries.map((entry) => Object.freeze({ ...entry }));
    const arrayLike = {};
    Object.defineProperty(arrayLike, Symbol.toStringTag, { value: tag });
    Object.defineProperty(arrayLike, 'length', { value: items.length, enumerable: false });
    Object.defineProperty(arrayLike, 'item', {
      value(index) {
        return items[index] || null;
      },
      enumerable: false,
    });
    Object.defineProperty(arrayLike, 'namedItem', {
      value(name) {
        return items.find((item) => item.name === name || item.type === name) || null;
      },
      enumerable: false,
    });
    items.forEach((item, index) => {
      Object.defineProperty(arrayLike, index, { value: item, enumerable: true });
      if (item.name) {
        Object.defineProperty(arrayLike, item.name, { value: item, enumerable: false });
      }
      if (item.type) {
        Object.defineProperty(arrayLike, item.type, { value: item, enumerable: false });
      }
    });
    return Object.freeze(arrayLike);
  }

  function loadPatchSettings() {
    return Object.keys(PATCH_DEFAULTS).reduce((acc, key) => {
      acc[key] = readPatchSetting(key);
      return acc;
    }, {});
  }

  function storageKey(key) {
    return 'noFingerprint.patch.' + key;
  }

  function readPatchSetting(key) {
    try {
      if (typeof GM_getValue === 'function') {
        return GM_getValue(storageKey(key), PATCH_DEFAULTS[key]) !== false;
      }
    } catch (_) {}

    return PATCH_DEFAULTS[key];
  }

  function writePatchSetting(key, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(storageKey(key), Boolean(value));
      }
    } catch (_) {}
  }

  function registerMenuCommands() {
    try {
      if (typeof GM_registerMenuCommand !== 'function') return;

      GM_registerMenuCommand('No Fingerprint: perfil da sessão', showSessionPanel);

      Object.keys(PATCH_DEFAULTS).forEach((key) => {
        const enabled = settings[key];
        const action = enabled ? 'Desativar' : 'Ativar';
        GM_registerMenuCommand('No Fingerprint: ' + action + ' ' + PATCH_LABELS[key], () => {
          const current = readPatchSetting(key);
          const next = !current;
          writePatchSetting(key, next);
          showMessage(
            'Patch ' + PATCH_LABELS[key] + ' ' + (next ? 'ativado' : 'desativado') +
            '. Recarregue a página para aplicar.'
          );
        });
      });
    } catch (_) {}
  }

  function showSessionPanel() {
    try {
      const lines = [
        'No Fingerprint 2.0.0',
        '',
        'Vendor: ' + session.webglVendor,
        'Renderer: ' + session.webglRenderer,
        'Screen: ' + session.width + 'x' + session.height + ' (avail ' + session.availWidth + 'x' + session.availHeight + ')',
        'Timezone: ' + session.timezoneLabel + ' (' + formatTimezoneOffset(session.timezoneOffset) + ')',
        '',
        'Patches:',
      ];

      Object.keys(PATCH_DEFAULTS).forEach((key) => {
        lines.push((readPatchSetting(key) ? '[on] ' : '[off] ') + PATCH_LABELS[key]);
      });

      showMessage(lines.join('\n'));
    } catch (_) {}
  }

  function showMessage(message) {
    try {
      const alertFn = root.alert || alert;
      alertFn.call(root, message);
    } catch (_) {}
  }

  function formatTimezoneOffset(offsetMinutes) {
    const sign = offsetMinutes <= 0 ? '+' : '-';
    const absolute = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
    const minutes = String(absolute % 60).padStart(2, '0');
    return 'UTC' + sign + hours + ':' + minutes;
  }

  function applyEnabledPatches() {
    const patches = [
      ['screen', patchScreen],
      ['navigator', patchNavigator],
      ['timezone', patchTimezone],
      ['canvas', patchCanvas],
      ['fonts', patchFonts],
      ['connection', patchConnection],
      ['speech', patchSpeechSynthesis],
      ['battery', patchBattery],
      ['webgl', patchWebGL],
    ];

    patches.forEach(([key, patch]) => {
      if (!settings[key]) return;
      try {
        patch();
      } catch (_) {}
    });
  }

  function defineGetter(target, key, getter) {
    if (!target) return;
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        get: getter,
      });
    } catch (_) {}
  }

  function defineMethod(target, key, value) {
    if (!target) return;
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        writable: true,
        value,
      });
    } catch (_) {}
  }

  function wrapMethod(target, key, wrapperFactory) {
    if (!target || typeof target[key] !== 'function') return;
    try {
      const original = target[key];
      const wrapped = wrapperFactory(original);
      defineMethod(target, key, wrapped);
    } catch (_) {}
  }

  function patchScreen() {
    const proto = Native.ScreenPrototype || (root.screen && Object.getPrototypeOf(root.screen));
    defineGetter(proto, 'width', () => session.width);
    defineGetter(proto, 'height', () => session.height);
    defineGetter(proto, 'availWidth', () => session.availWidth);
    defineGetter(proto, 'availHeight', () => session.availHeight);
    defineGetter(proto, 'colorDepth', () => session.colorDepth);
    defineGetter(proto, 'pixelDepth', () => session.pixelDepth);
  }

  function patchNavigator() {
    const navigatorRef = root.navigator;
    const proto = Native.NavigatorPrototype || (navigatorRef && Object.getPrototypeOf(navigatorRef));
    defineGetter(proto, 'hardwareConcurrency', () => session.hardwareConcurrency);
    if (navigatorRef && typeof navigatorRef.deviceMemory !== 'undefined') {
      defineGetter(proto, 'deviceMemory', () => session.deviceMemory);
    }
    defineGetter(proto, 'plugins', () => session.plugins);
    defineGetter(proto, 'mimeTypes', () => session.mimeTypes);
  }

  function patchTimezone() {
    if (Native.getTimezoneOffset && Native.DatePrototype) {
      defineMethod(Native.DatePrototype, 'getTimezoneOffset', function getTimezoneOffset() {
        return session.timezoneOffset;
      });
    }

    if (Native.resolvedOptions && Native.DateTimeFormatPrototype) {
      defineMethod(Native.DateTimeFormatPrototype, 'resolvedOptions', function resolvedOptions() {
        const options = Native.resolvedOptions.call(this);
        return { ...options, timeZone: session.timezoneLabel };
      });
    }
  }

  function patchCanvas() {
    const canvasProto = Native.HTMLCanvasElementPrototype;
    const contextProto = Native.CanvasRenderingContext2DPrototype;

    if (!canvasProto || !contextProto || !Native.getImageData) return;

    wrapMethod(contextProto, 'getImageData', (original) => function wrappedGetImageData(...args) {
      const result = original.apply(this, args);
      return applyCanvasNoiseToImageData(result, 'getImageData');
    });

    if (Native.toDataURL) {
      wrapMethod(canvasProto, 'toDataURL', (original) => function wrappedToDataURL(...args) {
        const noisyCanvas = createNoisyOffscreenCopy(this, 'toDataURL');
        if (noisyCanvas && Native.toDataURL) {
          return Native.toDataURL.apply(noisyCanvas, args);
        }
        return original.apply(this, args);
      });
    }

    if (Native.toBlob) {
      wrapMethod(canvasProto, 'toBlob', (original) => function wrappedToBlob(...args) {
        const noisyCanvas = createNoisyOffscreenCopy(this, 'toBlob');
        if (noisyCanvas && Native.toBlob) {
          return Native.toBlob.apply(noisyCanvas, args);
        }
        return original.apply(this, args);
      });
    }
  }

  function createNoisyOffscreenCopy(sourceCanvas, salt) {
    try {
      const width = sourceCanvas && sourceCanvas.width;
      const height = sourceCanvas && sourceCanvas.height;
      if (!width || !height || !Native.createElement) return null;

      const copy = Native.createElement('canvas');
      copy.width = width;
      copy.height = height;

      const ctx = copy.getContext && copy.getContext('2d', { willReadFrequently: true });
      if (!ctx || typeof ctx.drawImage !== 'function') return null;

      ctx.drawImage(sourceCanvas, 0, 0);
      applyCanvasNoiseToContext(ctx, width, height, salt);
      return copy;
    } catch (_) {
      return null;
    }
  }

  function applyCanvasNoiseToContext(ctx, width, height, salt) {
    try {
      const sampleWidth = Math.min(width, 256);
      const sampleHeight = Math.min(height, 256);
      const imageData = Native.getImageData.call(ctx, 0, 0, sampleWidth, sampleHeight);
      applyCanvasNoiseToImageData(imageData, salt);
      if (Native.putImageData) {
        Native.putImageData.call(ctx, imageData, 0, 0);
      } else if (typeof ctx.putImageData === 'function') {
        ctx.putImageData(imageData, 0, 0);
      }
    } catch (_) {}
  }

  function applyCanvasNoiseToImageData(imageData, salt) {
    if (!imageData || !imageData.data || imageData.data.length < 4) return imageData;

    const { data } = imageData;
    const totalPixels = Math.floor(data.length / 4);
    const pixelStride = Math.max(1, Math.floor(totalPixels / 96));
    const saltRand = rngFactory(session.seed + '|canvas|' + salt + '|' + totalPixels);
    const jitter = randomInt(saltRand, -1, 1);
    const shift = {
      r: session.canvasShift.r + jitter,
      g: session.canvasShift.g - jitter,
      b: session.canvasShift.b,
    };

    for (let pixel = 0; pixel < totalPixels; pixel += pixelStride) {
      const i = pixel * 4;
      data[i] = clamp(data[i] + shift.r, 0, 255);
      data[i + 1] = clamp(data[i + 1] + shift.g, 0, 255);
      data[i + 2] = clamp(data[i + 2] + shift.b, 0, 255);
    }

    return imageData;
  }

  function patchFonts() {
    const contextProto = Native.CanvasRenderingContext2DPrototype;
    if (!contextProto || !Native.measureText) return;

    wrapMethod(contextProto, 'measureText', (original) => function wrappedMeasureText(...args) {
      const metrics = original.apply(this, args);
      const text = args.length ? String(args[0]) : '';
      const font = typeof this.font === 'string' ? this.font : '';
      const width = metrics && typeof metrics.width === 'number'
        ? applyFontNoise(metrics.width, font + '|' + text)
        : undefined;

      if (typeof width !== 'number') return metrics;
      return createNoisyTextMetrics(metrics, width);
    });
  }

  function applyFontNoise(width, salt) {
    if (!Number.isFinite(width) || width === 0) return width;
    const rand = rngFactory(session.seed + '|font|' + salt);
    const noise = (rand() * 1) - 0.5;
    return Math.max(0, width + noise);
  }

  function createNoisyTextMetrics(metrics, width) {
    try {
      if (typeof Proxy === 'function') {
        return new Proxy(metrics, {
          get(target, prop) {
            if (prop === 'width') return width;
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
          getOwnPropertyDescriptor(target, prop) {
            if (prop === 'width') {
              return {
                configurable: true,
                enumerable: true,
                value: width,
              };
            }
            return Reflect.getOwnPropertyDescriptor(target, prop);
          },
        });
      }
    } catch (_) {}

    try {
      Object.defineProperty(metrics, 'width', {
        configurable: true,
        enumerable: true,
        value: width,
      });
    } catch (_) {}

    return metrics;
  }

  function patchConnection() {
    const connection = getConnectionObject();
    const proto = Native.NetworkInformationPrototype || (connection && Object.getPrototypeOf(connection));
    if (!proto && !connection) return;

    [proto, connection].forEach((target) => {
      defineGetter(target, 'rtt', () => session.connection.rtt);
      defineGetter(target, 'downlink', () => session.connection.downlink);
      defineGetter(target, 'type', () => session.connection.type);
      defineGetter(target, 'effectiveType', () => session.connection.effectiveType);
    });
  }

  function getConnectionObject() {
    try {
      const navigatorRef = root.navigator;
      return navigatorRef && (
        navigatorRef.connection ||
        navigatorRef.mozConnection ||
        navigatorRef.webkitConnection
      );
    } catch (_) {
      return null;
    }
  }

  function patchSpeechSynthesis() {
    const speech = root.speechSynthesis;
    if (!speech || typeof speech.getVoices !== 'function') return;

    const proto = Native.SpeechSynthesisPrototype || Object.getPrototypeOf(speech);
    if (proto && typeof proto.getVoices === 'function') {
      wrapMethod(proto, 'getVoices', (original) => function wrappedGetVoices(...args) {
        return normalizeVoices(original.apply(this, args));
      });
      return;
    }

    wrapMethod(speech, 'getVoices', (original) => function wrappedGetVoices(...args) {
      return normalizeVoices(original.apply(this, args));
    });
  }

  function normalizeVoices(voices) {
    try {
      return Array.prototype.slice.call(voices || [])
        .map((voice, index) => ({
          voice,
          index,
          rank: hashString(session.seed + '|voice|' + [
            voice && voice.name,
            voice && voice.lang,
            voice && voice.voiceURI,
          ].join('|')),
        }))
        .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
        .slice(0, 3)
        .map((entry) => entry.voice);
    } catch (_) {
      return voices;
    }
  }

  function patchBattery() {
    const navigatorRef = root.navigator;
    const proto = Native.NavigatorPrototype || (navigatorRef && Object.getPrototypeOf(navigatorRef));
    if (!navigatorRef || typeof navigatorRef.getBattery !== 'function') return;

    const target = proto && typeof proto.getBattery === 'function' ? proto : navigatorRef;
    wrapMethod(target, 'getBattery', (original) => function wrappedGetBattery(...args) {
      const result = original.apply(this, args);
      if (result && typeof result.then === 'function') {
        return result.then((battery) => createBatteryFacade(battery));
      }
      return createBatteryFacade(result);
    });
  }

  const batteryFacadeCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  function normalizeBatteryLevel(battery) {
    try {
      const level = Number(battery && battery.level);
      if (!Number.isFinite(level)) return 1;
      return Number(clamp(roundBucket(level, 0.1), 0, 1).toFixed(1));
    } catch (_) {
      return 1;
    }
  }

  function createBatteryFacade(battery) {
    if (!battery || typeof battery !== 'object' || typeof Proxy !== 'function') return battery;

    try {
      if (batteryFacadeCache && batteryFacadeCache.has(battery)) {
        return batteryFacadeCache.get(battery);
      }

      const facade = new Proxy(battery, {
        get(target, prop) {
          if (prop === 'level') return normalizeBatteryLevel(target);
          if (prop === 'charging') return true;
          if (prop === 'chargingTime') return 0;
          if (prop === 'dischargingTime') return Infinity;
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
        getOwnPropertyDescriptor(target, prop) {
          if (prop === 'level' || prop === 'charging') {
            return {
              configurable: true,
              enumerable: true,
              value: prop === 'level' ? normalizeBatteryLevel(target) : true,
            };
          }
          return Reflect.getOwnPropertyDescriptor(target, prop);
        },
      });

      if (batteryFacadeCache) batteryFacadeCache.set(battery, facade);
      return facade;
    } catch (_) {
      return battery;
    }
  }

  function patchWebGL() {
    const targets = [
      [Native.WebGLRenderingContextPrototype, Native.webglGetParameter],
      [Native.WebGL2RenderingContextPrototype, Native.webgl2GetParameter],
    ];

    targets.forEach(([proto, nativeGetParameter]) => {
      if (!proto || !nativeGetParameter) return;
      wrapMethod(proto, 'getParameter', (original) => function wrappedGetParameter(parameter) {
        const debugInfo = this.getExtension && this.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          if (parameter === debugInfo.UNMASKED_VENDOR_WEBGL) return session.webglVendor;
          if (parameter === debugInfo.UNMASKED_RENDERER_WEBGL) return session.webglRenderer;
        }

        if (parameter === 37445) return session.webglVendor;
        if (parameter === 37446) return session.webglRenderer;
        if (parameter === this.MAX_TEXTURE_SIZE) {
          const real = original.call(this, parameter);
          return clamp(roundBucket(real, 512), 2048, 16384);
        }
        return original.call(this, parameter);
      });
    });
  }
})();
