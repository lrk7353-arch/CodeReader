# R5 发布候选证据

**状态：候选执行中，未 `PASS`，未公开发布。** R4 已由维护者验收通过；本记录只描述 R5 的实际证据与阻塞，不把脚本存在、源码检查或单平台结果外推为四平台发布完成。

**候选版本准备：** `v1.0.0-rc.3` 已形成 draft，并完成十包与四平台 package smoke，但未完成完整 native journey；该 tag、制品和 smoke 只保留为 rc.3 历史事实，不复用于后续候选。本轮版本源统一提升为 `1.0.0-rc.4`。十包、四份 package smoke、四份 native journey、`SHA256SUMS`、SPDX SBOM、attestations 与签名状态必须全部绑定 rc.4 的同一最终新 commit/tag。

## 1. 固定工作包

1. 处置 R2 延期项，并把真实 OS 无障碍/恢复观察纳入原生旅程；
2. 从 detached 干净检出运行锁定依赖的前端、Rust、迁移、隐私、竞态、无障碍、文档与构建门禁；
3. 在匹配架构的原生主机生成十个包并分别执行 package smoke；
4. 独立验证四份产品旅程和四份 package smoke 均绑定发布 tag、commit、平台与架构；
5. 汇总 `SHA256SUMS`、SPDX 2.3 SBOM、release metadata 与 GitHub artifact attestations；
6. 保持 Windows 未签名事实和候选/公开发布边界。

## 2. 当前环境与可验证范围

当前执行环境是 WSL2 Linux x64。它可以真实执行 Linux x64 源码质量门禁和 Linux x64 打包；安装型 package smoke 还依赖 `rpm`、`docker`、`xvfb-run` 与受控的系统包安装。它不能替代 Linux ARM64、Windows x64、Windows ARM64，也不能生成 Authenticode 通过证据。

2026-08-12 在仓库外 detached `39bf17ef8318fe186c690d86065a8b54785e2923` 干净 worktree 执行 `npm ci` 后运行 `npm run verify:linux`。Rust `check`、`clippy`、124 项测试通过；前端与脚本 47 个文件、329 项测试通过；lint、format 和 production build 通过。该记录仍需根智能体复跑最终门禁。

2026-08-13 的 native journey 候选首次 lint 运行失败；修复后完整 `verify:linux` 复跑为前端与脚本 50 个文件、355 项测试以及 Rust 124 项测试全部通过，lint、format、build、check 与 clippy 全绿。Linux 与 Windows harness 静态候选分别经 Sol `high` 监督 `PASS`；这只证明候选实现满足证据契约，不代表四个平台已实际运行。

`npm ci` 的完整开发依赖审计报告 4 个 high 项；`npm audit --omit=dev --audit-level=high` 随后确认 production dependency graph 为 0 项漏洞。该结论只说明 npm 运行时依赖，不替代 RustSec、CodeQL 或完整供应链检查。

Linux x64 重型打包实际进入 Tauri release build：production 前端和 x86-64 release binary 均成功；二进制被 `file` 识别为 x86-64 ELF，SHA-256 为 `931ad9b510f5d9548c27253e6217562ab48966097978a48b22255dd0cb1d0356`。随后 bundle 工具下载 AppRun、linuxdeploy 及其插件时长时间无输出，按有界等待中止。没有生成 `artifacts/linux-x64` 或 bundle 目录，因此没有 AppImage、deb、rpm，不能执行或通过 Linux x64 package smoke。该网络阻塞未重试。

## 3. 发布能力盘点

| 目标 | 构建包 | 原生 runner | package smoke | 完整产品旅程 | 当前结果 |
| --- | --- | --- | --- | --- | --- |
| Windows x64 | NSIS、MSI | `windows-2022` | 安装、可见窗口、卸载、哈希 | picker、项目、解释、恢复、旧版升级、无障碍 | 未执行 |
| Windows ARM64 | NSIS、MSI | `windows-11-arm` | 同上 | 同上 | 未执行 |
| Linux x64 | AppImage、deb、rpm | `ubuntu-22.04` | 元数据、安装、可见窗口、卸载、哈希 | 同上 | 源码门禁与 release binary 通过；bundle 下载阻塞，无三包 |
| Linux ARM64 | AppImage、deb、rpm | `ubuntu-22.04-arm` | 同上 | 同上 | 未执行 |

发布构建工作流只从不可变 `v1.*` tag 检出，使用锁定 Rust 图，四个原生 runner 生成包。汇总阶段只在四份 package smoke 验证后运行，并受 `production-release` 环境控制；最终 Release 只能是 draft。独立发布工作流的单一写权限任务先等待维护者批准 `production-release-publish` environment；批准后才严格校验 tag、重新确认对应 Release 仍是 draft、下载当时的恰好四份 `native-journey-*.json`，并以该 tag 的实际 SHA 重新执行 `verify-journeys`。同一任务只有在这次复验成功后才可把该 draft 改为公开，消除环境等待期间证据变化的时间窗口。默认不运行该工作流，也不得通过 UI 或本地脚本旁路。

## 4. 两层原生证据

`native-smoke-*.json` 证明安装包本身：包元数据、安装、可见窗口启动、卸载和包哈希。`native-journey-*.json` 证明产品旅程：原生 picker 打开项目、解释生成、重启重新授权恢复、0.10/0.11 升级、卸载数据策略、键盘焦点、reduced motion、长内容、200% 缩放和对比度。

两层证据都必须有四个平台/架构记录，且绑定同一 tag 与 commit。产品旅程采用严格白名单 schema：顶层、每个 check 和可选 Authenticode 对象均拒绝未知字段，`observedAt` 必须是规范 UTC 时间，Windows/Linux 专属字段不得混用。任何 `pending`、缺项、`details`、自由文本嵌套、绝对路径、源码、提示词、模型响应、凭据或日志都会使验证失败。自动化机制测试和维护者 R4 的三项目验收不替代该平台矩阵。

## 5. 制品完整性与签名边界

- 汇总器要求十个精确命名的安装包并生成 SHA-256 清单与 release metadata；
- CI 生成依赖级 SPDX 2.3 SBOM，并在写入 Release 前验证包清单非空；
- GitHub 为安装包、SBOM 和 native smoke 分别生成 artifact attestation；
- 当前没有实际 Authenticode 通过证据，Windows 包必须继续标记 `windowsAuthenticodeSigned: false`；
- checksum、SBOM 和 provenance 不能描述成 Authenticode 身份签名的替代品。

## 6. R5 当前阻塞和退出边界

以下证据当前缺失，因此 R5 不能 `PASS`：

1. 四平台原生完整产品旅程；
2. 四平台十包与四份原生 package smoke；
3. 由实际制品生成并核验的最终 `SHA256SUMS`、SPDX SBOM 与 attestations；
4. 维护者对公开发布的独立明确批准；
5. 若公开范围要求 Windows 已签名，则还缺真实证书和 Authenticode 验证；在此之前只能如实标注未签名候选边界，不能宣称已签名。

上述缺口需要原生 runner/硬件、发布 tag、GitHub 证明权限或维护者决定。仓库内可安全完成的协议、拒绝伪证据门禁和文档先行完成；缺失外部证据时准确停在候选状态。

R4 的 small、frontend、fullstack 三项目维护者人工可用性已通过。当前仅 rc.4 的四平台 OS 级 native journey 与最终发布证据未完成：必须从 rc.4 不可变 tag 重建十包、四份 package smoke、四份 native journey、`SHA256SUMS`、SPDX SBOM 和 artifact attestations；rc.3 draft 的证据不得计入。
