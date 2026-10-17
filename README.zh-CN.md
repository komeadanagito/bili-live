<div align="center">

  <img src="app-icon.svg" width="96" height="96" alt="Bili Live" style="border-radius: 20px; margin-bottom: 12px;" />

  # Bili Live 桌面控制台

  **现代、轻量、高颜值的 B 站直播辅助与实时弹幕互动控制台**

  <p align="center">
    <a href="#核心特性">核心特性</a> &nbsp;•&nbsp;
    <a href="#快速启动">快速启动</a> &nbsp;•&nbsp;
    <a href="#项目构建">项目构建</a> &nbsp;•&nbsp;
    <a href="#安全机制">安全机制</a> &nbsp;•&nbsp;
    <a href="README.md">English</a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/版本-v0.1.4-blue?style=flat-square" alt="版本" />
    <img src="https://img.shields.io/badge/平台-Windows%20x64-0078D6?style=flat-square" alt="平台" />
    <img src="https://img.shields.io/badge/平台-Linux%20x64-FCC624?style=flat-square" alt="平台" />
    <img src="https://img.shields.io/badge/协议-MIT-green?style=flat-square" alt="协议" />
  </p>

  <p align="center">
    <a href="README.md">English</a> &nbsp;|&nbsp; 简体中文
  </p>

</div>

> 为 B 站主播打造的原生桌面中控台。专注极简启动、超低内存开销与凭据安全管理。

<div align="center">
  <p align="center"><b>🌙 深色模式</b></p>
  <img src="docs/images/image-dark.png" alt="Bili Live 控制台深色模式预览" width="880" style="border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); margin: 8px 0 24px 0;" />
  <p align="center"><b>☀️ 浅色模式</b></p>
  <img src="docs/images/image-light.png" alt="Bili Live 控制台浅色模式预览" width="880" style="border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.12); margin: 8px 0 24px 0;" />
</div>

---

## 核心特性

- **快捷扫码登录** &mdash; 手机客户端一键扫码，凭据交由系统凭据管理器加密托管（Windows DPAPI / Linux Secret Service），磁盘不落明文 Cookie。
- **直播推流中控** &mdash; 动态分区选择、一键开播与下播防误触，推流地址与密钥默认打码并支持一键复制到 OBS。
- **实时弹幕与高频表情** &mdash; 毫秒级接入普通弹幕，完美支持 B 站官方原生表情包图文混排渲染；覆盖礼物、醒目留言（SC）、大航海舰长及互动通知，断网自动平滑重连。
- **下播数据复盘** &mdash; 终止直播后自动呈现真实直播时长、总观看、峰值在线、弹幕总数与金仓鼠流水明细。
- **创新双模运行** &mdash; 既可作为极低资源占用的原生桌面客户端，也支持在任意现代浏览器中开启全功能开发调试。

---

## 快速启动

### 1. 浏览器全功能调试模式

无需原生编译，直接在浏览器中联动后端真实服务进行全流程调试：

```powershell
npm run web
```

### 2. 桌面客户端开发模式

启动带有热重载的原生桌面窗口：

```powershell
npm run tauri dev
```

---

## 项目构建

构建面向正式发布的安装包与可执行程序。

### Windows

```powershell
# 构建 NSIS 安装向导包与发布程序
npm run tauri build

# 仅构建独立可执行文件（免安装包）
npm run tauri build -- --no-bundle
```

输出路径：`src-tauri/target/release/bundle/nsis/`

### Linux（Debian / Ubuntu）

先安装系统依赖：

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev \
  build-essential pkg-config
```

再执行构建：

```bash
npm install
npm run tauri build
```

输出路径：

- `src-tauri/target/release/bundle/appimage/*.AppImage`（免安装，单文件）
- `src-tauri/target/release/bundle/deb/*.deb`（Debian / Ubuntu 安装包）

---

## Linux 用户说明

### 方式一：AppImage（推荐，免安装）

```bash
chmod +x Bili.Live_*.AppImage
./Bili.Live_*.AppImage
```

首次运行若提示缺少 FUSE，可安装：`sudo apt install libfuse2`；或改用 `--appimage-extract-and-run` 参数运行。

### 方式二：deb 安装包

```bash
sudo apt install ./Bili.Live_*.deb
```

安装后可在应用菜单中搜索「Bili Live」启动。

### Linux 平台差异说明

- **凭据存储**：使用系统 Secret Service（GNOME Keyring / KWallet）。若无可用密钥环，登录凭据将无法持久化，需每次重新扫码。
- **悬浮窗固定穿透**：X11 会话下与 Windows 体验一致（鼠标移到右上角图钉即可解锁点击）；Wayland 会话出于安全限制无法读取全局光标位置，此时悬浮窗保持纯穿透，可通过主窗口关闭或重新打开悬浮窗来解除。
- **自动更新**：以 AppImage 方式运行时支持原地覆盖升级并自动重启；deb 安装包则交由系统软件中心处理。

---

## 安全机制

- 登录凭据全流程由系统底层加密托管（Windows DPAPI / Linux Secret Service），前端不接触原始 Cookie。
- 串流密钥等敏感信息默认打码隐藏，仅在主动点击或复制时解密。
- 直播进行期间限制直接注销或切换账号，防止丢失下播控制权。

---

## 免责声明

本项目为第三方开源项目，非哔哩哔哩官方产品。请自觉遵守平台服务规范，仅操作具有合法管理权限的直播间。

基于 [MIT 许可证](LICENSE) 开源。
