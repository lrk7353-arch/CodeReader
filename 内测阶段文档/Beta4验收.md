# Beta 4 验收

阶段版本：`0.11.0-beta.4`

适用分支：`codex/beta3-prep-linux` 或 Beta4 工作分支。

本文是 Beta 4 的集中验收文档。每条主线有状态字段（`未开始` / `进行中` / `已完成` / `后续` / `外部阻塞`）和证据指针。Codex 按本表逐项复验，不接受"应该可以"的口头结论。

## 1. 验收范围

Beta 4 围绕"RC 前真实验收与发布链路硬化"收敛，不新增用户功能：

1. Windows release-chain smoke
2. 真实项目验证
3. 内测退出证据包（本文 + 路线图状态）
4. 失败原因统计与用户可见诊断
5. 长结构列表与大文件体验
6. Linux 桌面 smoke 补全
7. Rust 长模块按职责拆分
8. 文案资源层与受众扩大

## 2. 合入前门禁

在仓库根目录执行：

```bash
npm test
npm run lint
npm run format:check
npm run build
npm run cargo:test
npm run cargo:clippy
npm run cargo:check
git diff --check
```

Linux 验证批次另跑：

```bash
npm run doctor:linux
npm run verify:linux -- --json
```

Windows release-chain 批次按平台条件跑（无真实证书时只记录未签名内部测试状态）：

```powershell
npm run release:windows
node scripts/verify-authenticode.mjs artifacts/windows-x64/signing-manifest.json
```

## 3. 主线状态表

状态定义：`已完成` = 代码+测试+证据齐全；`模板完成` = 文档/脚本骨架就位但无真实执行记录；`manual-required` = 需人工桌面/主机会话，未执行；`外部阻塞` = 依赖外部前置条件（如真实证书）。

| 主线 | 状态 | 证据位置 |
| --- | --- | --- |
| 1. Windows release-chain smoke | 模板完成（人工 smoke manual-required） | [Windows release-chain smoke](./Windows-release-chain-smoke.md) + `scripts/windows-release-smoke.mjs` |
| 2. 真实项目验证 | 模板完成（真实样本记录待填） | [Beta4 真实项目验证](./Beta4真实项目验证.md) |
| 3. 内测退出证据包 | 已完成（本文档） | 本文档 + [迭代路线图](./迭代路线图.md) |
| 4. 失败原因统计与诊断 | 已完成（代码+测试+workspace UI 提示） | `src-tauri/src/app_error.rs` + `src/app/appError.ts` + 本文档第 5 节 |
| 5. 长结构列表与大文件体验 | 已完成（CSS 限高 + 测试） | `src/features/file-explorer/` + 本文档第 6 节 |
| 6. Linux 桌面 smoke 补全 | 模板完成（manual-required） | `scripts/linux-desktop-smoke.mjs` + [Linux 桌面 smoke](./Beta3-prep-linux.md) |
| 7. Rust 长模块拆分 | 已完成（首轮拆分，后续可继续） | `src-tauri/src/context_builder/budget.rs` + `src-tauri/src/code_service/language.rs` |
| 8. 文案资源层 | 已完成（ModelSettings 已迁，其余可后续） | `src/app/copy.ts` + `src/app/copy.test.ts` |

> 诚实说明：主线 1/2/6 的"模板完成"不等于"验收完成"。Windows 安装 smoke、Linux 桌面交互 smoke、真实项目多样本验证都需要人工执行或真实环境，当前只有脚本/文档骨架。这些在状态表里标为 `manual-required` 或 `模板完成`，不伪装为 `已完成`。

## 4. 平台与版本基线

| 项 | Windows 验证 | Linux 验证 |
| --- | --- | --- |
| 平台 | win32 x64 | WSL Ubuntu 24.04 LTS |
| Node.js | 记录实际版本 | v24.15.0 |
| npm | 记录实际版本 | 11.12.1 |
| Rust | 记录实际版本 | rustc 1.96.1 / cargo 1.96.1 |
| 门禁命令 | 见第 2 节 | `npm run verify:linux -- --json` |

## 5. 失败原因统计与诊断（主线 4 证据）

稳定错误码清单与前端映射见 `src-tauri/src/app_error.rs` 和 `src/app/appError.ts`。高风险路径的错误码覆盖：

| 路径 | 稳定码 | 可执行动作 |
| --- | --- | --- |
| 打开项目/扫描 | `fs.path_resolve_failed` / `fs.not_a_dir` | 检查路径 |
| 打开单文件/预览 | `fs.not_a_file` / `fs.read_failed` / `fs.too_large` / `fs.invalid_utf8` / `fs.unsupported` | 检查编码（invalid_utf8）/ 无（其他） |
| 路径解析 | `fs.path_resolve_failed` | 检查路径 |
| 生成解释/LLM | `llm.timeout` / `llm.connection` / `llm.http` / `llm.invalid_response` / `llm.empty_response` | 重试 / 检查网络 |
| SQLite 迁移/读写 | `db.error`（待细分） | 重试 |
| 凭据库/API Key | `credential.not_set` / `credential.unavailable` | 打开模型设置 |
| 配置错误 | `config.invalid` | 打开模型设置 |

前端映射见 `src/app/appError.ts` 的 `errorAction()`，按 code 返回 `retry` / `openModelSettings` / `checkEncoding` / `none`。

脱敏边界：不记录 API Key、完整源码、完整 prompt 或完整模型响应。具体可记录字段见 `内测反馈与回归清单.md`。

## 6. 长结构列表与大文件体验（主线 5 证据）

| 行为 | 现状 | Beta4 目标 |
| --- | --- | --- |
| 结构列表 compact 模式高度 | 无上限 | 限高，不淹没项目树 |
| 结构列表与项目树隔离 | 同容器 | 结构列表独立滚动或自动收起兄弟 |
| 大文件预览 | 2MB 硬闸，二态 | 明确原因 + 降级路径 |
| Context Builder 输入 | 整段 code | 有 size guard |

## 7. 已知限制与外部阻塞

- 真实 Authenticode 证书未获取：`require-signed` CI 强制门禁是公开分发前硬前置，属外部阻塞，不伪造完成。
- 第二非 OpenAI provider / Ollama 协议：延后，非 Beta4 阻塞。
- Linux 桌面交互 smoke 的 `openFileWorks` / `openProjectWorks` / `modelSettingsOpen` 需手动桌面会话，记录为 manual-required。
- 团队协作、云同步、完整知识图谱：非 Beta4 范围。

## 8. 候选版本数据完整性记录

从 Beta4 candidate 开始累计。不伪造"两个连续候选版本无数据丢失"结论。

| 候选 | 版本 | 数据丢失 | 升级失败 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | 0.11.0-beta.4 | （待验证） | （待验证） | Beta4 首个候选 |
