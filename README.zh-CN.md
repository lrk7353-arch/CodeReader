# CodeReader

[English](README.md) | [简体中文](README.zh-CN.md) | [版本沿革](docs/history/version-history.zh-CN.md) | [发布说明](docs/release/public-release-notes.zh-CN.md)

CodeReader 是一款本地优先的桌面阅读器，用于阅读源代码、纯文本与 Markdown，并在用户明确配置模型后生成可复核的 AI 解释。它不托管你的项目文件，不是云端协作服务，也不是自动修改代码的编辑器。

> 当前通道：1.0.0-rc.2 候选版。候选版用于完成完整的生产环境验证；稳定版将使用 1.0.0 版本号发布。

## 适用场景与边界

- 通过操作系统原生选择器打开你有权访问的任意本地文件或目录。
- 文件树会展示普通文件；不能安全预览的文件仍保留在列表中，并说明不能预览的原因。
- 阅读 JavaScript、TypeScript、Python、SQL、纯文本、Markdown，以及受大小限制的本地图片预览。
- 保存阅读进度、解释、项目指引、提示词版本和模型配置到本机。
- 当文件变化时，将可能过期的解释标记为需要重新生成。
- 使用你明确配置的 OpenAI 兼容 HTTPS 服务，或明确配置的本机回环地址模型服务。

CodeReader 不会获得任意文件系统权限：每次访问都以你在原生选择器中选定的文件或目录为界。它不会自动安装更新，也不会把源码上传到 CodeReader 自有服务器。

## 下载前先确认系统与架构

正式安装包只会发布在 [GitHub Releases](https://github.com/lrk7353-arch/CodeReader/releases)。不要从第三方转载页面下载。

| 系统 | 架构 | 可选安装包 |
| --- | --- | --- |
| Windows 10 22H2 或 Windows 11 | x64 | NSIS 安装程序 .exe 或 MSI |
| Windows 10 22H2 或 Windows 11 | ARM64 | NSIS 安装程序 .exe 或 MSI |
| Linux，glibc 2.35 或更新版本 | x64 | AppImage、.deb、.rpm |
| Linux，glibc 2.35 或更新版本 | ARM64 | AppImage、.deb、.rpm |

已文档化的 Linux 基线为 Ubuntu 22.04+、Debian 12+ 和 Fedora 39+。其他较新的 glibc 发行版属于社区兼容范围，只有经过实际验证后才会列入正式支持。

确认架构的方法：

- Windows：打开 设置 → 系统 → 系统信息，查看“系统类型”。常见 Intel/AMD 电脑选择 x64；Windows on ARM 设备选择 ARM64。
- Linux：运行 <code>uname -m</code>。<code>x86_64</code> 选择 x64；<code>aarch64</code> 或 <code>arm64</code> 选择 ARM64。

macOS 是下一版本目标，1.0 不提供 macOS 安装包，也不应使用其他平台安装包替代。

## 选择正确的安装包

发布页的文件名固定包含版本、平台、架构和格式，例如：

~~~text
CodeReader_1.0.0-rc.2_windows_x64_setup.exe
CodeReader_1.0.0-rc.2_windows_x64.msi
CodeReader_1.0.0-rc.2_linux_arm64.AppImage
~~~

| 使用环境 | 推荐选择 | 何时选择其他格式 |
| --- | --- | --- |
| 一般 Windows 个人电脑 | 当前架构的 <code>_setup.exe</code> | 企业软件分发、组策略或管理员部署时使用 MSI |
| Ubuntu / Debian | 当前架构的 .deb | 需要便携运行时使用 AppImage |
| Fedora / RPM 系发行版 | 当前架构的 .rpm | 需要便携运行时使用 AppImage |
| 无法或不希望安装系统包 | 当前架构的 AppImage | AppImage 仍依赖宿主机的 WebKitGTK 4.1 运行时 |

请只下载与你的架构一致的一种包格式。Windows x64 与 ARM64、Linux x64 与 ARM64 不能混用。

## 安装与首次启动

### Windows：NSIS 安装程序

1. 从 Release 下载对应架构的 <code>_setup.exe</code> 和 <code>SHA256SUMS</code>。
2. 先按“验证下载文件”一节核对哈希和 GitHub 证明。
3. 双击安装程序，按向导完成当前用户安装。
4. 在开始菜单中打开 CodeReader。

### Windows 未签名提示

CodeReader 当前没有 Authenticode 代码签名证书。除非某个 Release 明确声明签名已验证，否则 Windows 可能显示 SmartScreen 或“未知发布者”提示。不要因为提示而跳过校验；先核对 SHA-256 与 GitHub artifact attestation，再自行决定是否继续。

### Windows：MSI

MSI 面向受管设备、软件分发或管理员部署。下载匹配架构的 .msi 后，可在资源管理器中双击安装，也可以由组织的软件管理工具分发。命令行安装示例：

~~~powershell
msiexec /i .\CodeReader_1.0.0-rc.2_windows_x64.msi
~~~

安装包本身可能请求系统权限；这取决于设备策略和安装方式。

### Linux：Debian / Ubuntu

下载匹配架构的 .deb 后，在下载目录运行：

~~~bash
sudo apt install ./CodeReader_1.0.0-rc.2_linux_x64.deb
~~~

包管理器会解析 WebKitGTK 和 GTK 依赖。安装后可从应用菜单启动 CodeReader。

### Linux：Fedora / RPM 系发行版

下载匹配架构的 .rpm 后运行：

~~~bash
sudo dnf install ./CodeReader_1.0.0-rc.2_linux_x64.rpm
~~~

发行版会解析 WebKitGTK 和 GTK 依赖。使用其他 RPM 包管理器时，请使用该发行版推荐的本地 RPM 安装命令。

### Linux：AppImage

AppImage 是便携文件，不会自动解决图形运行时依赖：

~~~bash
chmod +x CodeReader_1.0.0-rc.2_linux_x64.AppImage
./CodeReader_1.0.0-rc.2_linux_x64.AppImage
~~~

宿主机仍需提供 WebKitGTK 4.1 与相应 GTK 运行时。若启动失败，请优先选择同一 Release 的 .deb 或 .rpm，或按发行版文档安装运行时。

### 第一次打开项目

1. 启动 CodeReader。
2. 选择“打开项目”或“打开文件”。
3. 在系统原生选择器中选择文件或文件夹。可以选择任意你有权限访问的位置。
4. 如需 AI 解释，配置 OpenAI 兼容服务或本机模型服务，并在发送前查看并确认有限的上下文与服务地址。

目录中的所有普通文件会显示在左侧树中。代码、Markdown、文本和受支持图片显示在阅读区；二进制、过大、特殊文件或不安全编码文件仍可见，但会显示元数据或不可预览原因，并不会替换当前正在阅读的可预览文件。

## 验证下载文件

每个正式 Release 都必须包含 <code>SHA256SUMS</code>、SPDX SBOM、release metadata、四份原生 smoke 记录和 GitHub artifact attestations。验证分为两层：

1. SHA-256 确认下载文件没有被替换或损坏。
2. GitHub artifact attestation 确认该资产由本仓库的受信工作流构建。

Windows PowerShell 示例：

~~~powershell
Get-FileHash .\CodeReader_1.0.0-rc.2_windows_x64_setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS
gh attestation verify .\CodeReader_1.0.0-rc.2_windows_x64_setup.exe -R lrk7353-arch/CodeReader
~~~

Linux 示例：

~~~bash
sha256sum -c SHA256SUMS
gh attestation verify CodeReader_1.0.0-rc.2_linux_x64.deb -R lrk7353-arch/CodeReader
~~~

命令输出的 SHA-256 必须与 <code>SHA256SUMS</code> 中同名文件完全一致。证明验证失败、Release 缺少要求的元数据，或文件名/架构不匹配时，请停止安装并在仓库提交 Issue。

## 卸载与本地数据

- Windows：从 设置 → 应用 → 已安装的应用 中卸载 CodeReader；NSIS 安装也会提供卸载入口。MSI 可由组织的软件管理工具或“已安装的应用”卸载。
- Debian / Ubuntu：<code>sudo apt remove codereader</code>。
- Fedora / RPM 系发行版：<code>sudo dnf remove codereader</code>。
- AppImage：退出应用后删除 AppImage 文件及你手动创建的桌面启动器。

卸载程序不应被当作数据清除工具。阅读进度、解释、模型配置和恢复备份存放在系统应用数据目录，凭据使用操作系统凭据存储。清除本地数据前，请先退出应用并复制备份；升级迁移失败时的数据库备份尤其不应删除。

## 升级、兼容性与恢复

从受支持的 0.10.x 或 0.11.x 升级时，CodeReader 会在迁移前验证并保留数据库备份，再以事务方式执行迁移并进行完整性检查。若无法安全完成，应用会保留原数据库并进入非破坏性的恢复状态，而不是继续写入不可信数据。

不要在没有备份的情况下尝试把新数据库降级给旧版本使用。详细的功能演进、兼容性承诺和迁移边界见 [版本沿革](docs/history/version-history.zh-CN.md)。

## 常见问题与排障

| 现象 | 建议处理 |
| --- | --- |
| Windows 启动为空白窗口 | 修复或安装 [Microsoft Edge WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)，重启 CodeReader 后再试。 |
| Windows 出现 SmartScreen / 未知发布者 | 先验证 SHA-256 和 artifact attestation。当前未签名是已公开限制，不应把证明材料表述为代码签名。 |
| Linux .deb / .rpm 安装失败 | 确认下载架构正确；使用发行版的包管理器安装本地文件，使其解决 WebKitGTK 4.1 与 GTK 依赖。 |
| AppImage 无法启动 | 检查可执行权限和宿主机 WebKitGTK 4.1；优先尝试同版本 .deb 或 .rpm。 |
| 文件树中看得到文件但阅读区没有内容 | 这通常表示文件是二进制、过大、特殊文件或编码不安全。它仍保留在列表中，不会覆盖当前阅读内容。 |
| 无法直接输入一个路径打开文件 | 这是安全边界：请使用“打开文件”或“打开项目”的原生选择器授予访问范围。你可以选择任意有权限的本地位置。 |
| AI 解释失败或连接超时 | 检查模型地址、模型名、网络或本机服务状态；重新生成前确认服务地址与即将发送的有限上下文。不要在反馈报告中粘贴 API 密钥、源码或模型回答。 |
| 升级后进入恢复状态 | 不要删除数据库或备份。保留提示信息和脱敏反馈报告，在 GitHub Issue 中说明版本、系统、稳定错误码与复现步骤。 |

反馈报告会在复制前显示脱敏预览，但你手动补充的文字不会自动替你删除敏感信息。

## 已知限制

- 1.0 首发仅支持 Windows 与 Linux 的 x64、ARM64；macOS 延后到下一版本。
- Windows 安装包目前未进行 Authenticode 签名。
- AppImage 依赖宿主机图形运行时，不能替代发行版包的依赖管理。
- CodeReader 只检查官方 GitHub Release 的更新信息，不会自动下载或安装更新。
- AI 解释会向你确认的模型服务发送有限上下文；不配置模型时，阅读功能仍可使用。

## 获取帮助与参与

- 安装、版本和验证信息：查看 [GitHub Releases](https://github.com/lrk7353-arch/CodeReader/releases)。
- 安全问题：遵循 [SECURITY.md](SECURITY.md)。
- 功能问题、安装问题或文档错误：在 [GitHub Issues](https://github.com/lrk7353-arch/CodeReader/issues) 提交，并附上脱敏后的错误信息和系统/架构。
- 开发与贡献：阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
