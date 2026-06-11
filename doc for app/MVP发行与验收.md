# CodeReader MVP 发行与验收

版本：v0.10.0
验收日期：2026 年 6 月 11 日
目标平台：Windows x64

## 1. 文档边界

本文只记录 CodeReader MVP 的桌面发行方式和最终验收结果，不重新定义或压缩全量产品目标。完整项目认知地图、更多语言、协作、云同步和插件入口仍属于后续路线。

MVP 发行目标是：

```text
普通用户安装 CodeReader -> 独立启动 -> 打开或体验项目
-> 阅读代码与持久化解释 -> 重启恢复 -> 代码变化后处理受影响解释
```

## 2. 正式产物

在仓库根目录的 Windows PowerShell 中执行：

```powershell
npm run release:windows
```

脚本会先运行环境检查、前端测试、TypeScript 检查、Rust 测试、Clippy、Cargo check 和前端生产构建，再生成：

| 产物 | 用途 |
|---|---|
| `artifacts/windows-x64/CodeReader_0.10.0_x64-setup.exe` | 推荐分发的 NSIS 当前用户安装包 |
| `artifacts/windows-x64/CodeReader_0.10.0_x64_zh-CN.msi` | 适合 MSI 管理流程的安装包 |
| `artifacts/windows-x64/release-manifest.json` | 版本、平台、架构、体积、来源和 SHA-256 |
| `artifacts/windows-x64/SHA256SUMS.txt` | 便于命令行核验的 SHA-256 清单 |

安装产物由 `.gitignore` 排除，不进入 Git 历史。每次正式构建后的准确体积和校验值以同目录的 manifest 与 checksum 文件为准。

校验示例：

```powershell
Get-FileHash .\artifacts\windows-x64\CodeReader_0.10.0_x64-setup.exe -Algorithm SHA256
Get-Content .\artifacts\windows-x64\SHA256SUMS.txt
```

## 3. 构建环境与依赖

正式构建使用现有项目工具链：

- Node.js 与 npm；
- Rust stable GNU toolchain；
- MinGW-w64；
- Tauri CLI v2；
- NSIS；
- WiX Toolset 3；
- Microsoft Edge WebView2。

项目规则保持不变：环境或依赖缺失时先正式安装并修复环境，不通过降低功能、伪造产物或跳过关键验证来绕开问题。

构建脚本优先使用 `D:\CodeReaderCache` 保存 Cargo target、Tauri 工具和临时文件；该目录不存在时使用系统盘的回退目录。可通过以下环境变量显式覆盖：

```powershell
$env:CODEREADER_CARGO_TARGET_DIR = "D:\CodeReaderCache\cargo-target"
$env:CODEREADER_RELEASE_CACHE_DIR = "D:\CodeReaderCache\release"
```

## 4. 安装与数据路径

NSIS 默认采用当前用户安装：

```text
程序目录：%LOCALAPPDATA%\CodeReader
应用数据库：%APPDATA%\com.codereader.app\codereader.sqlite
WebView2 用户数据：%LOCALAPPDATA%\com.codereader.app\EBWebView
API Key：Windows Credential Manager
```

凭据服务名为 `com.codereader.app`，默认用户名为 `default-llm-api-key`。API Key 不写入 SQLite、日志、项目文件或前端本地存储。

卸载程序默认移除应用本体，但保留用户数据库和系统凭据。重新安装后，CodeReader 可以恢复此前的项目、解释和阅读状态。这一策略适合 MVP 的“知识资产不随卸载意外消失”原则；后续可增加显式的“删除全部本地数据”入口。

## 5. 总验收矩阵

| 验收项 | 结果 | 说明 |
|---|---|---|
| NSIS 与 MSI 正式构建 | 通过 | 均为 Windows x64 release 产物 |
| 独立启动 | 通过 | 不依赖 Vite、Node 开发服务器或单独后端 |
| WebView2 运行时 | 通过 | 安装包含引导程序，GNU 构建包含 `WebView2Loader.dll` |
| 无 API Key 示例 | 通过 | 三文件示例可直接体验代码、解释与阅读路径 |
| 真实项目树 | 通过 | 层级目录、能力分类、文本预览与不可预览提示 |
| 推荐阅读路径与进度 | 通过 | 路径和文件级进度持久化 |
| JS/TS/Python/SQL | 通过 | 打开、解析、上下文、结构化解释链路有自动化覆盖 |
| 单行/多行/函数/文件目标 | 通过 | Context Builder 和结构化协议有自动化覆盖 |
| SQLite 恢复 | 通过 | 桌面重启后状态恢复，数据库校验保持一致 |
| 阅读状态与反馈 | 通过 | 已理解、有疑问、反馈和重新解释链路保留 |
| 变更检测 | 通过 | 变更摘要、过期、新增未解释和局部重解释有测试覆盖 |
| 卸载与重新安装 | 通过 | 应用本体移除，用户数据库和凭据保留并恢复 |
| LLM 提供方配置与协议 | 通过 | API Key 安全存储、结构化 JSON 校验、失败不覆盖已有解释 |
| 外部提供方真实生成 | 需用户凭据复验 | 本轮发行验收未擅自使用或传输用户 API Key |

自动化验收覆盖前端测试、TypeScript、Rust tests、Clippy、Cargo check 和生产构建。桌面验收覆盖 NSIS 安装、独立启动、重启恢复、卸载保留数据、MSI 安装与卸载，以及最终重新安装。

## 6. 已知限制

1. 当前安装包尚未进行 Authenticode 代码签名，Windows SmartScreen 可能提示未知发布者；公开大规模分发前应配置正式证书和签名流水线。
2. 当前正式验收平台是 Windows x64，尚未产出 macOS 或 Linux 安装包。
3. MSI 面向系统部署场景，安装或卸载可能触发管理员权限请求；普通用户优先使用 NSIS。
4. 应用标识 `com.codereader.app` 已承载现有数据库和凭据路径。Tauri 对以 `.app` 结尾的标识给出跨平台提示，MVP 为保持数据兼容暂不迁移，未来跨平台发行前需设计迁移方案。
5. Monaco 生产包体积较大是当前阅读体验的明确取舍，构建警告已知且不影响桌面运行。
6. MVP 不声称具备完整跨文件调用图、完整知识图谱、聊天主入口、云同步或团队协作。

## 7. 发布检查清单

正式发布前确认：

1. `git status` 不包含无关修改；
2. `npm run release:windows` 全流程通过；
3. `release-manifest.json` 与 `SHA256SUMS.txt` 已生成；
4. 使用最终 NSIS 安装包完成一次安装和独立启动；
5. 安装目录包含 `codereader.exe` 与 `WebView2Loader.dll`；
6. 应用可打开内置示例并恢复此前状态；
7. Git 不跟踪 `artifacts/`、Cargo target 或安装目录；
8. 提交发行配置和文档后再创建对应 release tag。
