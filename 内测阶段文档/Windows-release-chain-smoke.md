# Windows Release-Chain Smoke

阶段：Beta 4 主线 1

目标：让 `npm run release:windows` 的真实产物从"脚本可运行"变成"验收可复验"。无真实证书时必须明确记录为"未签名内部测试版"，不得伪装为正式签名。

## 产物清单

`npm run release:windows` 在 `artifacts/windows-x64/` 生成：

| 产物 | 说明 |
| --- | --- |
| `CodeReader_<version>_x64-setup.exe` | NSIS 安装包 |
| `CodeReader_<version>_x64_zh-CN.msi` | MSI 安装包（`-NsisOnly` 时省略） |
| `release-manifest.json` | 产物清单（含每个产物的 size/sha256/signing 子对象） |
| `SHA256SUMS.txt` | ASCII 哈希清单，每行 `<sha256>  <name>` |
| `signing-manifest.json` | 签名清单（configuration + artifacts 数组） |

## 自动化校验项

可自动化的部分（无需真实安装）：

- [ ] `release-manifest.json` 存在且 JSON 合法
- [ ] `SHA256SUMS.txt` 存在且每行 `<sha256>  <name>` 格式
- [ ] `signing-manifest.json` 存在且 JSON 合法
- [ ] manifest 中每个产物的 `sha256` 与实际文件 SHA-256 一致
- [ ] `SHA256SUMS.txt` 的哈希与 manifest 一致
- [ ] 无证书时 `signing-manifest.json` 的 `configuration.enabled === false`，每个产物 `signed === false`、`signatureStatus === "NotSigned"`
- [ ] `node scripts/verify-authenticode.mjs artifacts/windows-x64/signing-manifest.json --policy warn-unsigned` 退出码 0，verdict=WARN
- [ ] 有证书时 `signed === true` 且 `verified === true`，`--policy require-signed` 退出码 0

## 人工 smoke 清单（manual-required）

需在 Windows 主机真实安装后执行：

- [ ] `tauriDevLaunched`：安装后启动 CodeReader
- [ ] `windowVisible`：主窗口可见
- [ ] `openFileWorks`：打开单文件并预览
- [ ] `openProjectWorks`：打开项目并扫描
- [ ] `modelSettingsOpen`：模型设置入口可打开
- [ ] `upgradeOverInstall`：覆盖安装后本地数据（SQLite/凭据）保留
- [ ] `uninstallKeepsUserData`：卸载后用户数据保留策略明确（AppData 是否保留）

## 证据模板

运行 `node scripts/windows-release-smoke.mjs` 生成 `artifacts/windows-evidence/release-smoke.json` 模板，填入人工 smoke 结果。

## 签名策略说明

| 策略 | 未签名行为 | 退出码 | 用途 |
| --- | --- | --- | --- |
| `warn-unsigned`（默认） | verdict=WARN | 0 | 内部测试 |
| `allow-unsigned` | verdict=PASS | 0 | 开发构建 |
| `require-signed` | verdict=FAIL | 1 | 公开分发前强制 |

无真实证书时只能用 `warn-unsigned` / `allow-unsigned`，不得用 `require-signed` 伪造通过。
