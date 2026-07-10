# GLM-5.1 审查处置

审查日期：2026 年 6 月 12 日

| 建议 | 判断 | 本轮处置 |
|---|---|---|
| 清理异常目录、临时文件和 `Zone.Identifier` | 可取 | 已清理；现有 `.gitignore` 已覆盖构建产物、临时目录和下载标记。 |
| 拆分 `App.tsx` | 可取，但应渐进 | 已抽出 Context 生命周期和模型工作流 hook；文件/项目工作区状态暂留容器，避免一次性重写。 |
| 拆分 Rust 长模块 | 可取，但应按职责 | 已抽出 `persistence/schema.rs` 和 `llm_provider.rs`；后续继续按可独立测试的职责拆分。 |
| 建立数据库迁移 | 高优先级、必须 | 已使用 `PRAGMA user_version` 建立事务化顺序迁移，并覆盖新库、旧库和未来版本拒绝。 |
| 建立 LLM provider 抽象 | 可取 | 已建立 `LlmProvider` trait 和 OpenAI-compatible 实现；provider registry 与更多协议进入 Beta 3。 |
| 增加 CI | 高优先级、必须 | 已增加 GitHub Actions，执行前端测试/构建及 Rust test/clippy/check。 |
| 跨平台脚本 | 部分可取 | `cargo:*` 已提供跨平台 Node 入口；正式安装包仍只承诺 Windows x64。 |
| 国际化 | 方向可取，非本轮硬门槛 | 当前内测用户界面仍以中文为主；文案资源层进入 Beta 2。 |
| 细化错误类型 | 可取 | provider 已产生稳定分类；全后端统一 `AppError` 进入 Beta 2。 |

## Beta 2 收尾复核

- 文案资源层：已在 `0.11.0-beta.2` 中以 `src/app/copy.ts` 落地 `zh-CN`（默认）与 `en` 两套资源；本轮仅迁移阶段身份、顶栏、持久化、解释状态等可见顶层文案，深嵌套业务文案留待后续按区域推进。
- `AppError`：后端统一枚举与稳定错误码已合入，前端解析逻辑见 `src/app/appError.ts` 与 `src/app/appError.test.ts`。
- 签名验证：Windows 发布脚本接入 `scripts/sign-windows-artifacts.ps1`，并新增跨平台 `scripts/verify-authenticode.mjs` 策略层（Vitest 17 项覆盖），公开分发前切换为 `--require-signed` 即为硬门槛。
| 增加架构与上手文档 | 可取 | 已新增本架构入口与内测质量基线；根 README 更新阶段入口。 |
| 增加核心容器与 LLM 测试 | 判断部分失真 | 仓库原有 provider HTTP mock 测试；本轮新增 App 冒烟、错误映射和迁移测试，交互级 UI 测试进入 Beta 2。 |

## 未采用的做法

- 本轮不批量重命名 `doc for app/` 和历史中文文档目录，避免制造大量无关 diff 和链接失效。
- 本轮不引入 Zustand/Jotai；当前先用领域 hook 验证边界，只有共享状态继续增长时再评估状态库。
- 本轮不承诺 macOS/Linux 安装包，也不把国际化包装成已经完成。
