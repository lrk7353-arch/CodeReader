# Opus 4.8 审查处置

审查日期：2026 年 6 月 12 日

| 建议 | 判断 | 本轮处置 |
|---|---|---|
| 增加 CI | 建议正确，但结论已过时 | 仓库已有 GitHub Actions；本轮继续加入 ESLint 和 Prettier 门禁。 |
| 增加 ESLint 与 Prettier | 高优先级、可取 | 已采用 ESLint flat config、TypeScript 类型感知规则、React Hooks 规则和 Prettier 检查。 |
| 启用 Tauri CSP | 高优先级、可取 | 已移除 `csp: null`，分别配置生产和开发 CSP；保留 Monaco 所需的内联样式与 `blob:` Worker。 |
| 拆分 `App.tsx` 工作区流程 | 可取，但应渐进 | GLM 轮次已抽出 Context 和模型工作流 hook。本轮不做高风险状态重写；打开文件、打开项目和刷新控制器进入 Beta 2，并要求交互测试伴随重构。 |
| 安装包代码签名 | 风险真实，需要外部身份材料 | 当前没有可信证书，不能伪造“已完成”。未签名包仅限明确标注的内部测试，公开分发前必须通过签名门禁。`0.11.0-beta.2` 在 `scripts/sign-windows-artifacts.ps1` 中落地签名与验证流程，由 `scripts/release-windows.ps1` 自动调用并写入 `artifacts/windows-x64/signing-manifest.json`；新增 `scripts/verify-authenticode.mjs` 在任意平台执行 `warn-unsigned` / `allow-unsigned` / `require-signed` 策略，CI 接入后即可在拿到真实证书时直接切到 `require-signed` 作为硬门槛。 |
| 清理文档与下载标记 | 部分可取 | `Zone.Identifier` 已清理并被 `.gitignore` 覆盖；MVP 文档作为历史基线保留，旧 Git 文档增加阶段说明，避免大规模重命名破坏链接。 |
| 大文件预览会全量读入内存 | 结论部分失真，但边界可加强 | 原实现会在读取前拒绝超过 2MB 的文件，并非无上限全量读取；本轮增加实际读取上限，消除文件在元数据检查后增长的竞态。 |

## 本轮没有强行推进的事项

- 不为降低 `App.tsx` 行数一次性引入全局状态库或大规模 reducer；先建立可测试的异步流程边界。
- 不在没有组织身份、证书和私钥管理方案时提交虚假签名配置。
- 不删除仍被 README 引用的 MVP 历史文档，也不为目录美观制造大规模无行为 diff。

## 后续验收

1. CI 必须通过测试、lint、格式、构建、Rust test、fmt、clippy 和 check。
2. CSP 需要在 Windows Tauri 开发运行和生产安装包中验证 Monaco、文件打开、SQLite 与 LLM 调用。
3. Beta 2 的工作区重构必须覆盖打开文件、打开项目、刷新、取消/失败恢复和持久化恢复。
