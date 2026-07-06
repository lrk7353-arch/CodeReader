# CodeReader

CodeReader 是一个独立桌面端 AI 代码阅读 IDE，目标是把 AI 生成的代码从黑箱产物转化为可阅读、可解释、可审阅、可持久化、可逐步掌握的认知资产。

`v0.10.0-mvp` 已于 2026 年 6 月 11 日完成 Windows 桌面发行验收。项目从 2026 年 6 月 12 日起进入 `0.11.x` 内测迭代，当前阶段为 `0.11.0-beta.3`，重点从可诊断性与回归保护扩展到执行级 Prompt 灰度、Linux 开发验证和按职责的模块拆分。

## 文档入口

正式项目文档：

- [内测阶段文档](内测阶段文档/README.md)
- [内测质量基线](内测阶段文档/内测质量基线.md)
- [架构入口](内测阶段文档/架构入口.md)
- [内测迭代路线图](内测阶段文档/迭代路线图.md)
- [Opus 4.8 审查处置](内测阶段文档/Opus-4.8审查处置.md)
- [发布签名与安全门禁](内测阶段文档/发布签名与安全门禁.md)
- [项目文档包](<doc for app/README.md>)
- [产品设计文档](<doc for app/产品设计文档.md>)
- [需求文档](<doc for app/需求文档.md>)
- [技术架构与技术路线](<doc for app/技术架构与技术路线.md>)
- [MVP 实现标准](<doc for app/MVP实现标准.md>)
- [协议与治理](<doc for app/协议与治理.md>)
- [启动前检查报告 v0.4](<doc for app/启动前检查报告_v0.4.md>)
- [MVP 发行与验收](<doc for app/MVP发行与验收.md>)

开发辅助资料：

- [MVP 开发任务 Prompt v0.4](完善文档与prompt整理/CodeReader_MVP开发任务Prompt_v0.4.md)
- [启动前约束与检查](完善文档与prompt整理/启动前约束与检查.md)
- [本地 Git 管理文档](完善文档与prompt整理/git管理文档.md)

归档资料：

- [历史归档说明](archive/README.md)
- [VS Code 插件旧方向归档](<archive/for VS Code Extension/ARCHIVE.md>)

## 当前内测定位

内测版本继承已验收的最小阅读闭环：

```text
打开代码 -> 看见结构 -> 点击行/块/函数 -> 看到稳定解释 -> 用户标记理解 -> 解释被保存 -> 代码变更后提示过期
```

当前重点是旧库可升级、解释生成不破坏已有资产、真实项目问题可复现，以及每次改动都能经过自动化门禁。VS Code 插件主产品、聊天主入口、完整知识图谱、团队协作、云同步和自动代码修复仍不属于当前内测承诺。

## 开发者上手

前置依赖：

- Node.js 22 与 npm；
- Rust stable；
- Windows 桌面开发需要 WebView2 和 Tauri 对应构建工具；
- Windows 正式打包仍使用仓库现有 GNU/MinGW、NSIS 与 WiX 环境。

基础检查：

```bash
npm ci
npm test
npm run lint
npm run format:check
npm run build
npm run cargo:test
npm run cargo:clippy
npm run cargo:check
```

浏览器预览使用 `npm run dev`；完整本地文件、SQLite、系统凭据和 LLM 能力使用 `npm run tauri dev`。

## 本地 Git 规则

本项目采用本地 Git 优先策略：

- `main`：稳定基线；
- `dev`：日常开发分支；
- `feature/*`、`fix/*`、`codex/*`：单任务工作分支。

日常开发建议：

```bash
git status
git checkout dev
git checkout -b feature/task-name
```

AI 或人工修改前，如果当前状态已经稳定，先提交检查点：

```bash
git add .
git commit -m "checkpoint: before task-name"
```

修改后先看状态和 diff，再提交：

```bash
git status
git diff
git add .
git commit -m "feat: implement task-name"
```

## Windows 发行基线

在 Windows PowerShell 中执行完整检查并生成 x64 安装包：

```powershell
npm run release:windows
```

`v0.10.0-mvp` 已验收产物输出到 `artifacts/windows-x64/`：

- `CodeReader_0.10.0_x64-setup.exe`：推荐的当前用户 NSIS 安装包；
- `CodeReader_0.10.0_x64_zh-CN.msi`：供需要 MSI 部署的环境使用；
- `release-manifest.json` 与 `SHA256SUMS.txt`：记录架构、体积和 SHA-256。

安装包包含 React、Monaco、Rust、SQLite、Tree-sitter 和 WebView2 引导程序，不依赖 Vite、Node 开发服务器或独立后端进程。内测版本在完成新的安装/升级验收前，不替代该发行基线。当前安装包尚未进行 Authenticode 代码签名，Windows SmartScreen 可能显示未知发布者提示；公开分发前必须通过[发布签名与安全门禁](内测阶段文档/发布签名与安全门禁.md)。

## 当前阶段标签

- `v0.1-docs-ready`：文档与启动约束准备完成；
- `v0.2-app-shell`：Tauri + React 桌面骨架；
- `v0.3-code-viewer`：Monaco 阅读区；
- `v0.5-single-file-mvp`：单文件解释闭环；
- `v0.6-change-detection`：变更检测与解释过期；
- `v0.7-project-tree`：真实项目文件树与安全预览；
- `v0.8-python-support`：Python 结构化解释；
- `v0.9-sql-support`：SQL 结构化解释；
- `v0.10-first-mile`：推荐阅读路径、轻量项目地图、阅读进度和三文件示例。
- `v0.10.0-mvp`：Windows x64 安装包与 MVP 总验收完成。
- `0.11.0-beta.1`：内测工程基线，加入数据库迁移、CI、provider 边界和阶段质量规范。
- `0.11.0-beta.2`：内测可诊断性与回归保护，落地 `AppError` 分类、关键工作区交互测试、签名验证框架与文案资源层。
- `0.11.0-beta.3`：执行级 Prompt 灰度与 Linux 开发验证，落地 prompt 版本注册表/模板/灰度/回滚、Linux/Debian `verify:linux` 与 `tauri dev` 验收、`persistence_service` 按职责拆分。

`v0.10.0-mvp` 是已验证的桌面发行基线；`0.11.x` 是内测迭代线。完整知识图谱、更广泛语言支持、协作与云同步等能力仍按后续路线演进。
