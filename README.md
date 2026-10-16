# Bili Live 桌面直播控制台

React + TypeScript + Tauri 2 + Rust 开发的非官方 B 站直播辅助应用。初版优先支持 Windows：扫码登录、直播间开停播、推流信息管理，以及网页端实时弹幕与互动消息接收。

## 开发启动

本机需要 Node.js 20.19+（推荐 22/24）、Rust stable、Visual Studio C++ Build Tools（MSVC、Windows SDK），以及 Microsoft Edge WebView2 Runtime。

### 1. Web 调试版（浏览器全功能运行）

支持在任意浏览器中打开调试，**功能与 App 完全一致**（扫码登录、开停播、推流配置、实时弹幕 WebSocket 推送、下播统计全部可用）：

```powershell
npm run tauri web
# 或简写为
npm run web
```

会自动启动 Rust 本地服务（`http://127.0.0.1:1421`）并启动 Vite 开发服务器（`http://localhost:1420`），前端通过内部网关与 Rust 后端直接联动，无任何功能限制。

### 2. 桌面客户端开发模式

```powershell
npm run tauri dev
```

## 构建

本次已生成可直接运行的 Windows 调试版：`src-tauri/target/debug/bili-live-desktop.exe`（已内嵌前端，不需要另外启动 Vite）。该版本用于初版功能验证，尚未制作正式安装包。

重复生成调试版：

```powershell
npm run tauri build -- --debug --no-bundle
```

构建发布版及安装包：

```powershell
npm run tauri build
```

Windows 安装包输出到 `src-tauri/target/release/bundle/nsis/`；可执行文件输出到 `src-tauri/target/release/bili-live-desktop.exe`。安装包构建可能需要联网下载 NSIS 等工具。

仅构建可执行文件、不创建安装包：

```powershell
npm run tauri build -- --no-bundle
```

## 使用步骤

1. 启动桌面客户端，使用 B 站手机客户端扫码并确认登录。
2. 选择直播子分区，点击“开启直播间”。账号需要已经开通直播权限。
3. 在“推流配置”中复制地址和串流密钥，填入 OBS 等推流软件，再从该软件开始发送音视频。
4. 输入直播间号，点击“连接”，接收弹幕、礼物、上舰、醒目留言和互动消息。可监听自己的直播间或其他直播间。
5. 下播时点击“结束直播”并确认。停播成功后尝试获取官方场次统计。

关闭应用窗口不会自动结束 B 站直播，也不会替 OBS 停止发送视频。退出登录前必须停止本应用发起的直播；由其他软件发起的直播仍需用户自行确认直播状态。

## 初版范围

- 扫码登录、二维码过期刷新、登录状态获取、退出账号。
- 系统凭据管理器持久化 Cookie，不保存明文 `cookies.json`。
- 获取直播分区和上次直播分区，开播、获取推流地址和推流码、停播。
- 推流地址和密钥默认隐藏，点击后显示或复制。
- 单直播间网页端 WebSocket 接入、短房间号解析、WBI 签名、连接认证、心跳、断线重连、服务器轮换。
- 普通/跨房弹幕、礼物（包括新版 Protobuf）、上舰、醒目留言及删除通知、进房/关注/分享等互动、部分点赞与直播状态通知。
- zlib、Brotli 解压；包长、解压大小、嵌套深度限制。
- 消息过滤、搜索、清空；仅在内存保留最近 500 条，关闭应用后不保留历史。
- 停播后的直播时长、弹幕数、观看数、粉丝变化等统计；查询失败明确显示不可用，而不是伪造数据。

暂未包含：音视频采集/编码/实际推流、开放平台接入、多房间同时监听、OBS 浏览器源、语音播报、自动回复、持久化历史、封禁管理、自动更新。醒目留言删除事件当前显示通知，不保证撤回历史中已有留言。

## 测试

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

单元测试覆盖基础消息解析、Protobuf 事件、zlib/Brotli、多包解码、异常长度、用户 ID 精度和前端辅助函数。实际扫码登录、账号直播权限、开停播与弹幕内容需要用户在桌面端实测：B 站接口与风控可能变化，编译通过不代表线上接口一定可用。

## 安全与限制

- 登录 Cookie 仅交给 Rust 后端，并在 Windows 系统凭据管理器保存。前端只获取显示账号所需的信息。
- 密钥复制会写入系统剪贴板，可能被剪贴板历史或其他软件读取，请谨慎使用。
- 推流信息仅在本次应用内存中保存，重启后不会自动恢复；由其他软件开播或重启应用后，停播统计可能缺少场次标识。
- 默认只允许本地桌面页面调用相关能力，前端不直接请求 B 站登录接口。
- 网络请求设置超时；弹幕重新连接最大等待 30 秒。持续认证/风控失败时，请断开、检查账号和网络后再尝试。
- 项目当前以 Windows 为验证平台；macOS/Linux 的打包和凭据存储支持需另行完善。
- 统计字段以平台返回值为准，“金仓鼠流水”不擅自换算为人民币或主播实际收入。

## 项目结构

- `src/`：React 界面、类型、登录轮询和前端辅助函数。
- `src-tauri/src/api.rs`：HTTP API、二维码、凭据存储。
- `src-tauri/src/danmaku.rs`：弹幕服务器初始化、连接与重连。
- `src-tauri/src/protocol.rs`：二进制协议、压缩包、事件与 Protobuf 解码。
- `src-tauri/src/lib.rs`：桌面命令与应用状态管理。
- `docs/功能文档.md`：初版功能与验收说明。

## 参考与授权

功能需求参考 `bilibili_live_stream`，弹幕协议与 Protobuf 字段参考 MIT 许可的 `blivedm`，相关许可证与说明见 `THIRD_PARTY_NOTICES.md`。本项目未直接导入 `bilibili_live_stream` 的 Rust 模块。该项目 AGPL 许可证及 README 中的用途限制需在未来复用其代码之前另行确认。

本项目不是 B 站官方产品。请遵守平台协议，仅操作自己有权限的直播间，避免高频请求。发布或商业化前需进一步核查依赖授权、平台接入规则及接口可用性。
