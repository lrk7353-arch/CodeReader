# Beta 4 任务书兼 Zcode 工作提示词

适用分支：`codex/beta3-prep-linux` 或从当前 Beta3 主线切出的 Beta4 工作分支。  
阶段目标：把 CodeReader 从“Beta3 工程基线完成”推进到“RC 前真实验收与发布链路硬化完成”。  
工作方式：Zcode 负责大批量实现、拆分、补测试和整理证据；Codex 负责最终 review、门禁复验、查漏补缺和合并判断。

## 给 Zcode 的总提示词

你现在接手 CodeReader 的 Beta4 全量推进工作。这个项目已经不是 MVP，它正在走向更广泛内测受众。你的任务不是谨慎地做几个小补丁，而是把 Beta4 作为一个完整阶段推进：真实项目验证、发布链路验收、诊断闭环、长文件体验、Linux 桌面 smoke、Rust 长模块拆分、文案资源层和验收证据都要形成可复验结果。

你可以主动拆分步骤、创建文档、补测试、抽模块、修体验，但必须遵守仓库现有架构、质量门禁和 Git 纪律。不要为了完成清单伪造证据；不能真实验证的事项要写成明确的 manual-required 或 external-blocked。不要把“公开分发签名完成”写成完成，除非真的有受 Windows 信任的证书并通过 `require-signed`。

最终目标是让 Codex 接手 review 时能看到清晰的 Beta4 证据包：代码 diff 可审、测试可跑、文档口径一致、已知限制诚实、真实项目与发布链路验证路径明确。

## 当前基线

- 当前阶段：`0.11.0-beta.3`。
- Beta3 已完成：
  - Prompt registry / 灰度 / 回滚 / prompt 模板持久化。
  - Linux/Debian `verify:linux`，当前 7 道门禁通过。
  - OpenAI-compatible chat/completions 与 responses-style 支持。
  - `persistence/explanation_hydration.rs` 已从 `persistence_service.rs` 抽出。
  - 生成等待体验已改为右侧面板非阻塞进度条。
- Beta4 重点不是再补 Beta3，而是进入 RC 前验证和硬化。

## 必须完成的 8 条主线

### 1. Windows Release-Chain Smoke

目标：让 Windows 安装包发布链路从“脚本可运行”变成“验收可复验”。

执行：

- 检查 `scripts/release-windows.ps1`、`scripts/sign-windows-artifacts.ps1`、`scripts/verify-authenticode.mjs` 的当前行为。
- 补充或完善 release-chain smoke 文档，至少覆盖：
  - 生成 `.exe` / `.msi`。
  - `release-manifest.json`、`SHA256SUMS.txt`、`signing-manifest.json` 是否存在且互相一致。
  - 未配置证书时是否明确记录 `unsigned-internal-beta` 或等价状态。
  - 安装后启动、打开示例、打开文件、打开项目、模型设置入口。
  - 升级覆盖安装后本地数据是否保留。
  - 卸载后用户数据保留策略是否明确。
- 能自动化的部分写脚本或测试；不能自动化的部分写 manual evidence template。

交付：

- 新增或更新 Windows release-chain smoke 文档。
- 如有脚本逻辑改动，补对应测试。
- 不允许把未签名内测包描述为公开可分发正式包。

### 2. 真实项目验证

目标：证明 CodeReader 在真实项目上能连续完成阅读闭环。

执行：

- 建立真实项目验证文档或 evidence 模板，至少支持 3 类样本：
  - 小型项目：几十个文件以内。
  - 常规中型项目：数百文件或多语言结构。
  - 压力项目：长文件、超多函数/类、深目录或含二进制/大文件。
- 记录这些指标：
  - 扫描耗时、文件总数、可预览数量、不可预览数量、跳过原因。
  - 首个可读文件加载是否稳定。
  - 结构列表是否可用，长列表是否影响回到项目结构。
  - 解释生成成功/失败、失败码、是否覆盖旧解释。
  - 刷新后解释是否迁移、标 stale、标 deleted 或保留历史。
- 如果仓库中不能放真实项目源码，就创建不含源码的 evidence 模板和说明，必要时使用合成 fixture 覆盖边界。

交付：

- 当前归档目录下新增 Beta4 真实项目验证文档。
- 如果新增自动化 fixture，必须不含第三方项目源码或敏感数据。

### 3. 内测退出证据包

目标：开始积累“可以进入 RC 候选”的证据，而不是只说测试通过。

执行：

- 新增 Beta4 验收文档，统一记录：
  - 命令、平台、Node/npm/Rust 版本。
  - Windows release-chain smoke。
  - Linux desktop smoke。
  - 真实项目验证。
  - 数据迁移 / 损坏库 / 旧库升级 / 模型失败不覆盖旧解释。
  - 已知限制和外部阻塞项。
- 更新路线图，使 Beta4 每条主线有状态字段：`未开始`、`进行中`、`已完成`、`后续`、`外部阻塞`。
- 不要伪造两个连续候选版本无数据丢失的结论；可以建立记录表，从 Beta4 candidate 开始累计。

交付：

- `Beta4验收.md` 或等价文档。
- 证据表清晰到 Codex 可以按表复跑/抽查。

### 4. 失败原因统计与用户可见诊断

目标：真实使用时，失败不能只是一句“失败了”。要知道是哪一步失败、是否可重试、是否影响已有数据。

执行：

- 梳理这些路径的错误：
  - 打开项目 / 扫描项目。
  - 打开单文件 / 预览限制 / UTF-8 / 二进制 / symlink。
  - 刷新文件 / 代码变更迁移。
  - 生成解释 / provider 请求 / 结构化 JSON 校验 / retry。
  - SQLite 迁移、读写、损坏库。
  - 凭据库不可用 / API Key 缺失。
- 优先复用现有 `AppError` 和 provider error code；不要到处新增散乱字符串。
- 前端错误展示要给出可执行动作，例如重试、检查模型配置、换小范围、查看不可预览原因。
- 日志/证据不得记录 API Key、完整源码、完整 prompt 或完整模型响应。

交付：

- 错误码/失败原因映射补齐。
- 对高风险路径补单元测试或交互测试。
- 文档更新：说明可记录字段与脱敏边界。

### 5. 长结构列表与大文件体验

目标：用户打开一个巨长代码文件时，不能被左侧结构列表淹没，也不能失去项目结构。

执行：

- 检查当前文件结构列表、项目树、长函数/类列表、imports/if/else 等节点展示策略。
- 设计并实现一种稳定策略：
  - 默认只显示前 N 个结构项，提供“展开全部 / 收起”。
  - 或按类型分组：类、函数、导入、控制流。
  - 或按层级折叠，保证项目树可回到上层。
- 处理大文件：
  - 文件超限时要明确显示原因。
  - 可预览但结构过多时，不应卡 UI。
  - Context Builder 不能无边界读取全文。
- 给长列表行为补 React Testing Library 或纯函数测试。

交付：

- UX 改动可见、交互可测。
- 长列表不再挤掉项目结构视野。

### 6. Linux Desktop Smoke 补全

目标：Beta3 已证明 Linux 能启动，Beta4 要证明基本交互能走完。

执行：

- 完善 `scripts/linux-desktop-smoke.mjs` 或对应 evidence 模板。
- 补全 manual checklist：
  - `tauriDevLaunched`
  - `windowVisible`
  - `openFileWorks`
  - `openProjectWorks`
  - `modelSettingsOpen`
  - `nonBlockingGenerationProgressVisible`
- 如果能自动化窗口探测，可做；如果环境不稳定，诚实记录 manual-required。

交付：

- Linux smoke evidence 文档或 JSON 模板更新。
- Beta4 验收文档引用该证据。

### 7. Rust 长模块按职责拆分

目标：降低 review 和回归成本。不要机械追求行数，但要拆出真正能独立测试的职责。

优先候选：

- `context_builder.rs`
  - 可拆方向：budget、signals、snippet selection、language adapters、static analysis cache。
  - 每个子模块必须有清晰输入输出，不要把全局状态传得到处都是。
- `code_service.rs`
  - 可拆方向：preview limits、project scanning、language detection、tree projection、WSL path handling。
  - 文件读取边界和安全限制要保持测试覆盖。

执行规则：

- 每次拆分保持行为不变。
- 先移动纯逻辑和测试，再抽共享类型。
- 不要同时重写算法和搬文件，除非有明确测试保护。
- 保留或增加现有测试，避免只靠 `cargo check`。

交付：

- 模块拆分 commit 目的单一。
- `cargo:test`、`cargo:clippy`、`cargo:check` 通过。

### 8. 文案资源层与受众扩大

目标：面向更广泛受众时，用户可见文案不能继续散落在组件和 hook 里。

执行：

- 把高频文案纳入 `src/app/copy.ts` 或更合适的资源层：
  - 模型设置。
  - 生成确认。
  - 生成中状态。
  - 错误提示。
  - 文件不可预览原因。
  - Prompt registry 管理。
- `zh-CN` 是默认；`en` 入口继续保留。
- 不要求一次性商业化翻译全部深层文本，但新增用户可见文案不能扩大硬编码债务。
- 更新 copy 测试，保证两种 locale 覆盖相同 key。

交付：

- 文案迁移和测试。
- 不引入运行时语言切换大架构，除非现有结构已经支持。

## 推荐拆分顺序

按下面顺序推进，不要一口气把所有主题混在一个巨大 diff 里：

1. 文档和证据框架：Beta4 验收、真实项目模板、Windows smoke 模板、Linux smoke 模板。
2. 长结构列表 UX：这是最接近用户感知的 Beta4 体验项，优先落地并补测试。
3. 失败原因统计与诊断：补稳定错误码、前端映射、脱敏说明和测试。
4. Windows release-chain 自动检查：先做 manifest/哈希/签名策略可自动化部分，再留人工安装清单。
5. Linux desktop smoke 补全：把 Beta3 的启动证据升级成基础交互证据。
6. 文案资源层：按区域迁移，不要一次性制造过大冲突。
7. Rust 模块拆分：挑最安全、测试最多的职责先拆；每个拆分都保持行为不变。
8. 最终 Beta4 验收整理：更新路线图状态、CHANGELOG 草稿、README 阶段说明。

## Git 与提交要求

- 单个 commit 只解决一个清晰主题。
- 不提交构建产物、用户数据库、临时目录、真实项目源码、凭据或证书。
- 不碰无关未跟踪文件。
- 遇到外部阻塞要写入文档，不要假装完成。
- 大批量重命名必须有理由，并避免混入行为变更。

建议 commit 形态：

- `docs: add beta4 acceptance plan`
- `feat: cap long structure lists`
- `fix: classify workspace failure reasons`
- `test: cover release signing manifest policy`
- `refactor: split context budget builder`
- `docs: record beta4 validation evidence`

## 必跑门禁

局部开发时至少跑相关测试。每个可合并批次最终必须跑：

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

Linux 验证批次还必须跑：

```bash
npm run doctor:linux
npm run verify:linux -- --json
```

Windows release-chain 批次按平台条件跑：

```powershell
npm run release:windows
node scripts/verify-authenticode.mjs artifacts/windows-x64/signing-manifest.json
```

如果没有真实签名证书，不要跑出“正式签名通过”的结论；只能记录未签名内部测试状态。

## 非目标

Beta4 不做这些事：

- 不承诺公开分发正式版。
- 不伪造 Authenticode 签名完成。
- 不把 macOS/Linux 改成正式发行平台。
- 不实现团队协作、云同步、完整知识图谱或自动代码修复。
- 不为了拆模块而重写核心算法。
- 不把真实用户源码、API Key、完整 prompt 或完整模型响应写进日志/文档/测试 fixture。

## 最终交付清单

完成 Beta4 后，至少应有：

- 更新后的 `docs/history/beta/迭代路线图.md`。
- `docs/history/beta/Beta4验收.md` 或等价验收文档。
- Windows release-chain smoke 文档/模板/脚本。
- Linux desktop smoke 补全证据。
- 真实项目验证模板和至少一份可脱敏记录。
- 长结构列表 UX 改动和测试。
- 失败原因统计/诊断改动和测试。
- 必要的 Rust 模块拆分和测试。
- 文案资源层补齐和测试。
- 最终门禁输出摘要。

做完后，把每个主线的状态标成 `已完成`、`后续` 或 `外部阻塞`，并写清楚证据位置。Codex 会按证据逐项复验，不接受“应该可以”的口头结论。
