<div align="center">

  <img src="app-icon.svg" width="96" height="96" alt="Bili Live" style="border-radius: 20px; margin-bottom: 12px;" />

  # Bili Live

  **A modern, lightweight live streaming and interaction console for Bilibili.**

  <p align="center">
    <a href="#features">Features</a> &nbsp;•&nbsp;
    <a href="#quick-start">Quick Start</a> &nbsp;•&nbsp;
    <a href="#build">Build</a> &nbsp;•&nbsp;
    <a href="#security">Security</a> &nbsp;•&nbsp;
    <a href="README.zh-CN.md">简体中文</a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/version-v0.1.0-blue?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/platform-Windows%20x64-0078D6?style=flat-square" alt="Platform" />
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  </p>

  <p align="center">
    English &nbsp;|&nbsp; <a href="README.zh-CN.md">简体中文</a>
  </p>

</div>

> A clean, native desktop companion for Bilibili streamers. Built for instant startup, low memory footprint, and secure credential handling.

<div align="center">
  <img src="docs/images/image.png" alt="Bili Live Console Preview" width="880" style="border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); margin: 16px 0 28px 0;" />
</div>

---

## Features

- **QR Code Sign-in** &mdash; Fast authentication with the mobile app; credentials are encrypted in Windows Credential Manager without plain cookies on disk.
- **Broadcast Control** &mdash; Category selection, one-click start/stop broadcasting, and protected RTMP stream keys ready for OBS.
- **Live Danmaku & Interaction** &mdash; Real-time Danmaku, gift events, Super Chats, guard renewals, and viewer interactions with automatic reconnection.
- **Post-Stream Summary** &mdash; Instant overview of duration, total views, peak viewers, danmaku counts, and fan trends upon ending a stream.
- **Dual-Mode Workflow** &mdash; Run natively as a desktop app or launch in any browser for full-featured debugging.

---

## Quick Start

### 1. Browser Simulation Mode

Run a complete development session in your browser with live Rust backend services:

```powershell
npm run web
```

### 2. Desktop Client Mode

Run the native desktop application with live reload:

```powershell
npm run tauri dev
```

---

## Build

Package the application for production distribution:

```powershell
# Build NSIS installer and release binaries
npm run tauri build

# Build standalone executable only
npm run tauri build -- --no-bundle
```

Installer output directory: `src-tauri/target/release/bundle/nsis/`

---

## Security

- Session cookies are strictly maintained in the OS credential vault (DPAPI) and never exposed to the frontend.
- Stream keys remain masked by default until explicitly copied or toggled.
- Active broadcasts cannot be exited accidentally without explicit confirmation.

---

## Disclaimer

This is an unofficial community project not affiliated with or endorsed by Bilibili. Please comply with platform rules and use within authorized broadcasting permissions.

Licensed under the [MIT License](LICENSE).
