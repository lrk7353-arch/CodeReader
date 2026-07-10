# Beta 2 验收

阶段版本：`0.11.0-beta.2`

合入分支：`codex/beta2-finalization` → `dev`（合并提交 `ef1bf10`）

本文是 Beta 2 合入前的集中验收清单。门禁细节以 [内测质量基线](./内测质量基线.md) 为准，签名细节以 [发布签名与安全门禁](./发布签名与安全门禁.md) 为准，本文不重复全文，只给出可执行的验收路径和证据指针。

## 1. 验收范围

Beta 2 围绕“可诊断性与回归保护”收敛，不新增用户功能：

1. 后端 `AppError` 分类与稳定错误码贯穿前后端。
2. 关键工作区流程具备 React Testing Library 交互测试。
3. 迁移回滚、损坏数据库、凭据不可用等失败路径有自动化测试。
4. 内测反馈模板、日志脱敏规则和回归清单落地。
5. 工作区异步流程拆出可单测的控制器边界。
6. Authenticode 签名与验证框架进入 Windows 发布脚本，不要求真实证书即可运行。
7. 用户文案资源层抽取完成，英文 UI 入口预留。
8. 阶段身份、版本号和文档定位统一升至 Beta 2。

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

任一命令失败即不得合入。`npm test` 通过 `scripts/test.mjs` 在 Windows 上自动经 WSL 运行，确保 Linux 与 Windows 两套原生依赖都被覆盖。

## 3. 验收证据

| 条目                        | 证据                                                                                                                                                                                                           | 校验方式                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `AppError` 分类与稳定错误码 | `src-tauri/src/app_error.rs`、`src/app/appError.ts`、`src/app/appError.test.ts`                                                                                                                                | `npm run cargo:test`、`npm test`                                                                              |
| 工作区交互测试              | `src/features/file-explorer/FileExplorer.interaction.test.tsx`、`src/features/explanation-panel/ExplanationPanel.interaction.test.tsx`、`src/features/model-settings/ModelSettingsDialog.interaction.test.tsx` | `npm test`                                                                                                    |
| 工作区控制器拆分            | `src/app/hooks/workspaceRefreshController.ts`、`projectOpenHelpers.ts`、`hydrateLoadedFile.ts`、`workspaceFileList.ts`、`retainExplanation.ts` 及各自 `.test.ts`                                               | `npm test`                                                                                                    |
| 迁移回滚                    | `src-tauri/src/persistence/schema.rs` `failed_migration_rolls_back_user_version`                                                                                                                               | `npm run cargo:test`                                                                                          |
| 损坏数据库保护              | `src-tauri/src/persistence_service.rs` `corrupted_database_file_returns_error_without_replacing_file`                                                                                                          | `npm run cargo:test`                                                                                          |
| 凭据不可用                  | `src-tauri/src/explanation_service.rs` `credential_store_no_entry_is_treated_as_missing_key`、`credential_store_access_failure_has_stable_error_code`                                                          | `npm run cargo:test`                                                                                          |
| 反馈模板与回归清单          | [内测反馈与回归清单](./内测反馈与回归清单.md)                                                                                                                                                                  | 文档评审                                                                                                      |
| Authenticode 签名框架       | `scripts/sign-windows-artifacts.ps1`、`scripts/release-windows.ps1`                                                                                                                                            | `powershell.exe -NoProfile -File scripts/release-windows.ps1 -SkipChecks`（无证书时记录为“未签名内部测试版”） |
| 签名策略校验                | `scripts/verify-authenticode.mjs`、`scripts/verify-authenticode.test.mjs`                                                                                                                                      | `npm test`、`node scripts/verify-authenticode.mjs <manifest> --require-signed`                                |
| 用户文案资源层              | `src/app/copy.ts`、`src/app/copy.test.ts`、`src/app/App.tsx`                                                                                                                                                   | `npm test`                                                                                                    |
| 阶段身份一致                | `package.json`、`src-tauri/tauri.conf.json`、`src/app/copy.ts`、`src/app/App.test.tsx`、`CHANGELOG.md`                                                                                                         | `grep -rn "beta.2\|Beta 2" package.json src-tauri/tauri.conf.json src/app/copy.ts CHANGELOG.md`               |

## 4. 签名验收

未配置证书时，发布脚本写入 `artifacts/windows-x64/signing-manifest.json`，每个产物 `signed=false`、`signatureStatus=NotSigned`。这是 Beta 2 内测分发的预期状态。

```bash
# 在 Windows 发布后校验
node scripts/verify-authenticode.mjs artifacts/windows-x64/signing-manifest.json
# 退出码 0，verdict=warn，允许内测分发
```

面向不受控用户分发前，必须配置 `CODEREADER_CODESIGN_*` 环境变量并改用：

```bash
node scripts/verify-authenticode.mjs artifacts/windows-x64/signing-manifest.json --require-signed
# 退出码 1 时禁止分发
```

`--require-signed` 在 Beta 2 阶段不是默认策略；真实证书获取后才在 CI 中作为硬门槛。证书获取前，`scripts/sign-windows-artifacts.ps1` 的签名与验证流程已就绪，无需改动脚本结构。

## 5. 已知限制

1. Windows 安装包未签名，仅限开发者本人和已知内测成员使用，必须标注“未签名内部测试版”。
2. 英文 UI 入口已在 `src/app/copy.ts` 预留，但 `getCopyLocale()` 固定返回 `zh-CN`，不对外暴露切换。
3. macOS/Linux 仍属后续验证目标，Beta 2 不承诺。
4. Authenticode 签名框架已就绪，但“受 Windows 信任的真实证书”尚未获取，属外部前置条件。

## 6. 合入后动作

1. 在 `dev` 分支上验证上述门禁全部通过。
2. 更新 [内测反馈与回归清单](./内测反馈与回归清单.md) 中的合入回归清单，记录本轮实际跑过的路径。
3. 若分发内测包，附带 `artifacts/windows-x64/release-manifest.json`、`signing-manifest.json` 和 `SHA256SUMS.txt`，并在分发说明中标注“未签名内部测试版”。
4. 收到真实证书后，将 `verify-authenticode.mjs --require-signed` 接入 CI，并把本节“已知限制”中的第 1、4 条移除。
