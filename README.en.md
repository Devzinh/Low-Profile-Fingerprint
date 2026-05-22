# Low-Profile-Fingerprint

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Issues](https://img.shields.io/github/issues/Devzinh/Low-Profile-Fingerprint)](https://github.com/Devzinh/Low-Profile-Fingerprint/issues)

<p align="center">
  <img src="assets/Fingerprint Banner.png" alt="Low-Profile-Fingerprint userscript banner" width="640">
</p>

Userscript that reduces browser fingerprint uniqueness with lightweight per-session noise and defensive normalization.

**Portuguese version:** [README.md](README.md)

## Table of Contents

- [Overview](#overview)
- [How it works](#how-it-works)
- [Analogy](#analogy)
- [Features](#features)
- [Installation](#installation)
- [Quick test](#quick-test)
- [Suggested metadata](#suggested-metadata)
- [Limitations](#limitations)
- [Use cases](#use-cases)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [Support](#support)
- [License](#license)

## Overview

**Low-Profile-Fingerprint** is a privacy-focused userscript designed to make common browser fingerprinting techniques harder to use without relying on aggressive blocking or breaking browser APIs. Instead of trying to completely erase browser identity, the script reduces highly specific signals and adds small plausible variations per session.

The goal is simple: make the browser look less unique to systems that try to identify users through characteristics such as screen properties, timezone, canvas, WebGL, fonts, plugins, battery, and connection data.

## How it works

The script runs at `document-start`, before many fingerprinting checks happen, and applies defensive adjustments to browser APIs commonly used for identification.

Signals handled by the script include:

- `screen` (width, height, available area, color depth)
- `navigator` (hardware concurrency, device memory, plugins, and mimeTypes)
- `timezone` (`getTimezoneOffset` and `Intl.DateTimeFormat().resolvedOptions()`)
- `canvas` (`getImageData`, `toDataURL`, `toBlob`)
- `fonts` through lightweight noise in text measurements
- `connection` (`rtt`, `downlink`, `effectiveType`, `type`)
- `speechSynthesis` (voice list normalization)
- `battery` (facade for Battery API properties)
- `WebGL` (vendor, renderer, and selected parameters)

This approach follows a defensive anti-fingerprinting strategy based on normalization and lightweight noise: reducing stability and uniqueness of exposed signals without making the browser obviously fake or internally inconsistent.

## Analogy

Imagine visiting a website as entering a mall where a security guard tries to recognize each visitor by their clothes, the way they walk, their watch, and the details of their shoes. Browser fingerprinting works in a similar way: instead of asking for your name, it observes technical browser traits to decide whether it has “seen you before.”

**Low-Profile-Fingerprint** works like a light, consistent disguise. You still enter normally, but with less unique details and small per-session changes, making you look more like “just another regular person” than someone easy to recognize from a distance.

## Features

- Early execution with `@run-at document-start`
- Lightweight and consistent per-session noise
- Defensive normalization across multiple browser APIs
- Configuration menu for enabling and disabling patches
- Compatibility with userscript managers such as Tampermonkey

## Installation

You can install the latest version directly from the repository:

- [Install via Tampermonkey / Userscript manager](https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js)

Manual steps:

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Enable the option to allow user scripts in the browser or extension if prompted.
3. Open the `low-profile-fingerprint.user.js` file.
4. Install the script through your userscript manager.
5. Reload the pages where you want to test its behavior.

## Quick test

1. Install the script normally.
2. Visit [BrowserLeaks Canvas](https://browserleaks.com/canvas) or another fingerprint testing website.
3. Compare browser behavior with and without the script enabled.
4. Check for differences in canvas, WebGL, timezone, and other exposed signals.

### Before

<p align="center">
  <img src="assets/browserleaks-before.png" alt="BrowserLeaks Canvas result before using Low-Profile-Fingerprint" width="700">
</p>

### After

<p align="center">
  <img src="assets/browserleaks-after.png" alt="BrowserLeaks Canvas result after using Low-Profile-Fingerprint" width="700">
</p>

## Suggested metadata

```javascript
// ==UserScript==
// @name         Low-Profile-Fingerprint
// @namespace    https://github.com/Devzinh/Low-Profile-Fingerprint
// @version      1.0.0
// @description  Disguise your browser by normalizing common fingerprint signals and adding lightweight per-session noise to reduce tracking.
// @author       Rony Gabriel
// @homepageURL  https://github.com/Devzinh/Low-Profile-Fingerprint
// @supportURL   https://github.com/Devzinh/Low-Profile-Fingerprint/issues
// @updateURL    https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js
// @downloadURL  https://github.com/Devzinh/Low-Profile-Fingerprint/raw/main/low-profile-fingerprint.user.js
// @match        *://*/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==
```

## Limitations

This project does not guarantee total anonymity. Browser fingerprinting combines many different signals, and poorly calibrated anti-fingerprinting techniques can sometimes make a browser more identifiable when they create rare or inconsistent patterns.

Some websites may also react unexpectedly to changes in APIs such as canvas, WebGL, timezone, or battery, especially applications that are highly sensitive to graphics environment or hardware detection.

## Use cases

- Practical study of browser fingerprinting
- Portfolio project focused on privacy and security
- Defensive userscript experiments
- Exploration of browser APIs and signal normalization

## Contributing

Suggestions, issues, and pull requests are welcome.

If you want to contribute, you can:
- report site incompatibilities
- suggest new patches
- improve the documentation
- propose compatibility and privacy adjustments

## Roadmap

- Add domain exclusions
- Create balanced mode and strict mode
- Improve technical documentation for each patch
- Publish installable releases
- Add site compatibility tests

## Support

- [Open an issue](https://github.com/Devzinh/Low-Profile-Fingerprint/issues)

## License

MIT
