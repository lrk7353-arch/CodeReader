# R5 发布候选证据

**状态：候选执行中，未 `PASS`，未公开发布。** R4 已由维护者验收通过；本记录只描述 R5 的实际证据与阻塞，不把脚本存在、源码检查或单平台结果外推为四平台发布完成。

**候选版本准备：** `v1.0.0-rc.3` 已形成 draft，并完成十包与四平台 package smoke，但未完成完整 native journey；该 tag、制品和 smoke 只保留为 rc.3 历史事实。`v1.0.0-rc.4` 的 Production Release run `31654257774` 在 validate 阶段失败，未生成安装包。`v1.0.0-rc.5` 的 run `31656328041` 通过 validate、Linux x64/ARM64 与 Windows ARM64 package smoke；Windows x64 安装包构建成功，但 smoke 清理已自行退出进程时触发竞态失败，verify 与 assemble 跳过，未形成 draft 或最终证据。上述 tag、制品、单平台 smoke、失败运行和日志仅保留用于审计，不复用于后续候选。本轮版本源统一提升为 `1.0.0-rc.6`。十包、四份 package smoke、四份 native journey、`SHA256SUMS`、SPDX SBOM、attestations 与签名状态必须全部绑定 rc.6 的同一最终新 commit/tag，并从零生成。

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

rc.6 的首次 Native Product Journey run `31659436776` 在任何平台安装前停止：只读矩阵任务无法通过 GitHub API 读取 draft Release，返回 `release not found`，因此没有生成任何平台 journey 结果。该失败不代表包或平台验证结果，日志只保留用于审计。后续流程由受 `production-release` 保护且仅该阶段具 `contents: write` 的 prepare job 严格核对 exact tag、HEAD、draft、十包、`SHA256SUMS` 和四份 package smoke，再以不可变 workflow artifact 交给只读四平台矩阵；最终 attach job 仍须在受保护写权限中重新下载并验证当前 draft，禁止复用本次失败作为任何通过证据。

修复权限交接后的 run `31661162165` 仍在任何平台安装前停止：workflow 从 rc.6 tag 检出后调用了只存在于较新 workflow revision 的候选快照工具，Node 返回 `MODULE_NOT_FOUND`，因此同样没有生成平台 journey 或可接受证据。该次修复先将新增快照和证据门禁固定到触发 workflow 的不可变提交，并把 rc.6 候选源码独立检出到 `candidate-source`；后续 run 又证明 journey driver 也必须属于当前受审 harness，完整边界见下一条。tag/HEAD 身份始终只从候选目录解析，不得移动或重用 rc.6 tag 来掩盖失败。

run `31665833835` 进一步证明上述边界仍不完整：四个平台实际调用 rc.6 tag 内的旧 journey driver；Windows x64/ARM64 在旅程开始时命中旧 RequiredPaths `.Count` 缺陷，Linux x64/ARM64 由旧 driver 返回泛化 session failure，因此没有可接受的平台证据。后续执行采用双身份：包、候选 tag/SHA、示例和历史 seed data 继续来自不可变 rc.6；driver、UI helper、fixture extractor、manifest 与 evidence verifier 来自触发 workflow 的受审 commit。四份严格 JSON 同时记录相同的 candidate `commitSha` 和 `harnessCommitSha`，attach 以当前 workflow HEAD 复核 harness 身份后才允许上传。harness SHA 只说明测量工具版本，不改变或替代产品候选身份。

run `31667108294` 中 Windows x64/ARM64 已越过此前 RequiredPaths 问题，但在安装项发现阶段读取了混合注册表对象；部分对象没有 `DisplayName`，严格模式使简写 `Where-Object DisplayName` 直接失败。该 run 仍没有 Windows 可接受 journey 证据。修复后只在对象确有 `DisplayName` 属性时比较，并严格要求恰好一个 CodeReader 安装项；零个和多个都以固定 `installer-discovery` phase/category/exit 失败，不输出注册表对象、路径或自由错误内容。Linux 两架构在同一 run 仍停于脱敏 `native-session/nonzero-exit`，没有可接受 journey 证据。

run `31668180422` 的 Windows 后续尝试到达当前 MSI 的安装项解析，但注册表记录不保证同时提供 `InstallLocation` 与 `DisplayIcon`，旧 harness 因此固定报告 `installer-discovery/invalid-entry`；该 run 没有形成可接受 Windows journey 证据。修复后从受控 MSI `Property` 表读取 ProductCode/ProductVersion，并以 ProductCode、`DisplayVersion=1.0.0`、Publisher 和 DisplayName 联合选择当前包记录；旁系同名残留不参与匹配，多个当前匹配仍拒绝。可执行位置可由当前 MSI 的 Windows Installer 产品信息补充，身份和诊断只输出固定类别与计数语义，不输出注册表值或路径。

同一 run 的 Linux x64/ARM64 仍只暴露固定 `native-session/nonzero-exit`，不足以判断真实内部阶段，因此不推测业务原因或宣称修复。后续 session 在 runner profile 外的受控临时文件写入严格 failure envelope；phase 和 category 均为固定枚举，exit 仅允许进程退出码，不包含命令、路径、stderr、源码、prompt、response 或自由文本。Node runner 验证完整 schema 后才输出该三元组，缺失、篡改或含额外字段统一降级为 `native-session/internal-error/-1`；成功时删除且不生成发布证据。

run `31670448106` 中 Windows x64/ARM64 已启动应用，但迁移探针只等待脚本改写的 `APPDATA` 路径，最终报告数据库未创建；该信息不能证明产品未迁移，只证明 harness 没有按 Tauri 的 Windows 路径契约观察数据库。Tauri `app_data_dir` 使用系统 Roaming AppData known folder 加应用 identifier，而不是直接信任改写后的环境变量。修复后通过 Windows known-folder API 得到 runner 用户的唯一受控根，只检查其下 `com.codereader.desktop/codereader.sqlite` 精确候选；启动进程仍显式继承隔离的 `APPDATA`/`LOCALAPPDATA` 供其他组件使用。等待期间零个固定报 `migration/database-not-created`，多个固定报 `migration/ambiguous-database`，不递归扫描、不输出路径。Linux 两架构在该 run 返回 `native-session/internal-error/-1`；同构复现确认 Bash ERR trap 未启用函数/子 shell 继承，且 `set +e` 会在函数内抑制预期的失败传播。session 改为 `set -E` 并以条件命令捕获 timeout 状态后，内外层共享 helper 才能可靠写回固定 envelope。该诊断增强仍不代表 Linux 业务阶段已修复。

run `31671946470` 中 Windows x64/ARM64 在第一次迁移清理前停止：PowerShell 将两个数组以逗号连接后作为嵌套对象数组绑定到 `Remove-Item -Path`，无法转换为字符串。修复后先合并并展开受控路径组，再逐项用 `Test-Path` 与 `Remove-Item -LiteralPath`；不存在视为已清理，0 组和多组均有原生严格模式回归。Linux x64/ARM64 均在约 20 秒后报告 `fixture-0.10/command-failed/1`；现有脱敏日志无法区分应用非零退出、20 秒迁移窗口耗尽后数据库缺失、schema/integrity 失败、历史数据缺失或备份缺失，因此不宣称已确定业务根因。harness 现将这些边界分别折叠为固定 `launch-failed`、`timeout`、`database-not-created`、`schema-invalid`、`data-missing`、`backup-missing`，只保留 phase/category/exit，不输出 SQLite 内容、路径或子进程输出；下一次 run 才能给出可行动的真实边界。

监督复审进一步收紧上述候选：Linux 备份 glob 使用显式条件捕获，`compgen` 的标准“无匹配”状态稳定映射为 `backup-missing`，其他异常不冒充缺失；同源 shell 回归实际在空目录执行该 glob。Windows 路径清理改为 `Get-Item -LiteralPath -ErrorAction Stop`，仅 `ItemNotFoundException` 视为已清理，访问或解析异常统一折叠为不含路径的 `migration-cleanup/cleanup-error`；若已有主失败，现有清理编排仍保留并重新抛出主失败。

双检出修复后的 run `31662115050` 在四平台安装前构造 v0.11 current 迁移样本时停止：Linux 与 Windows ARM64 都命中该阶段；从 v3 历史提交抽取的“新建库完整基线”已包含 prompt 模板列，流程又执行同提交的 v3 增量 ALTER，SQLite 按严格规则报告 duplicate column。Windows ARM64 同时出现 Chocolatey 下载 SQLite 的 504，旧 step 未可靠传播原生命令失败，后续才因找不到 `sqlite3` 暴露问题。因此该 run 没有生成平台 journey 或可接受证据。修复后 v3 使用权威 v2 完整 schema 作为基线，并且只追加 v3 的 `migrate_to_v3` 一次；SQLite 的重复列错误仍保持为失败，不被忽略或降级。Windows 工具安装也必须检查 Chocolatey 退出码、`Get-Command sqlite3` 和实际版本探针，任一失败立即阻断。

run `31664403176` 已进入原生旅程，但没有形成可接受的四平台证据。Windows 暴露 PowerShell 管道在单个缺失路径时返回标量、直接访问 `.Count` 不可靠的问题；修复后所有过滤结果强制包装为数组，并以 0、1、多个缺失项验证严格模式。现有仓库与本地环境没有该 run 的完整 GitHub job 日志，不能可靠判定 Linux 失败的内部阶段；下一次运行会只向控制台报告脱敏 phase、固定错误类别和子进程退出码，原始子进程输出不会进入公开日志或证据。该增强仅改善安全诊断，不把未知失败写成已修复或通过。

`npm ci` 的完整开发依赖审计报告 4 个 high 项；`npm audit --omit=dev --audit-level=high` 随后确认 production dependency graph 为 0 项漏洞。该结论只说明 npm 运行时依赖，不替代 RustSec、CodeQL 或完整供应链检查。

Linux x64 重型打包实际进入 Tauri release build：production 前端和 x86-64 release binary 均成功；二进制被 `file` 识别为 x86-64 ELF，SHA-256 为 `931ad9b510f5d9548c27253e6217562ab48966097978a48b22255dd0cb1d0356`。随后 bundle 工具下载 AppRun、linuxdeploy 及其插件时长时间无输出，按有界等待中止。没有生成 `artifacts/linux-x64` 或 bundle 目录，因此没有 AppImage、deb、rpm，不能执行或通过 Linux x64 package smoke。该网络阻塞未重试。

## 3. 发布能力盘点

| 目标          | 构建包             | 原生 runner        | package smoke                      | 完整产品旅程                               | 当前结果                                                                               |
| ------------- | ------------------ | ------------------ | ---------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Windows x64   | NSIS、MSI          | `windows-2022`     | 安装、可见窗口、卸载、哈希         | picker、项目、解释、恢复、旧版升级、无障碍 | rc.6 已多次尝试；最近一次由旧 harness 在 RequiredPaths 检查失败，无可接受 journey 证据 |
| Windows ARM64 | NSIS、MSI          | `windows-11-arm`   | 同上                               | 同上                                       | rc.6 已多次尝试；最近一次由旧 harness 在 RequiredPaths 检查失败，无可接受 journey 证据 |
| Linux x64     | AppImage、deb、rpm | `ubuntu-22.04`     | 元数据、安装、可见窗口、卸载、哈希 | 同上                                       | rc.6 已多次尝试；最近一次旧 harness 的 native session 失败，无可接受 journey 证据      |
| Linux ARM64   | AppImage、deb、rpm | `ubuntu-22.04-arm` | 同上                               | 同上                                       | rc.6 已多次尝试；最近一次旧 harness 的 native session 失败，无可接受 journey 证据      |

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

R4 的 small、frontend、fullstack 三项目维护者人工可用性已通过。当前仅 rc.6 的四平台 OS 级 native journey 与最终发布证据未完成：必须从 rc.6 不可变 tag 从零生成十包、四份 package smoke、四份 native journey、`SHA256SUMS`、SPDX SBOM 和 artifact attestations；rc.3 draft、rc.4 失败运行以及 rc.5 的制品与单平台 smoke 均不得计入。
