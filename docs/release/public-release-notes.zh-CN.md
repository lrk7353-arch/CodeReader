# CodeReader 公开 Release 页面规范

本文定义 GitHub Release 页面面对用户时必须提供的中文信息。它与维护者执行用的 [生产发布手册](github-release.md) 配套：发布手册说明如何构建和验收；本文保证用户能够选择、验证、安装、升级和卸载实际资产。

## 发布页的权威来源

- 每次正式标签发布时，release workflow 会生成并上传 RELEASE-NOTES.md。该文件是 GitHub Release 正文的权威来源，必须同时含简体中文和 English。
- 根目录 README.zh-CN.md 是完整中文安装、验证、升级、卸载和排障指南；README.md 是英文入口。
- 仅当 Release 页面存在十个平台安装包、四个 native-smoke 记录、SHA256SUMS、SPDX SBOM、release metadata 和 workflow attestation 时，才可称为可下载发行版。
- 没有标签、没有 Release 页面，或只有 workflow artifact 时，项目只是具备构建能力，不是已经发布的软件。

## 每个 Release 正文必须回答的问题

1. 这是候选版还是稳定版？候选版必须明确说明不能替代稳定部署。
2. 哪些 Windows/Linux 版本与 x64/ARM64 架构受支持？macOS 是否包含？
3. 每种系统应下载哪一个确切文件，NSIS、MSI、.deb、.rpm、AppImage 分别适合什么场景？
4. WebView2 与 WebKitGTK 4.1 等前置条件是什么？
5. 如何通过 SHA256SUMS 和 GitHub artifact attestation 验证下载？
6. Windows 是否经过 Authenticode 验证？未验证时必须显著提示，而不是用 SBOM 或 provenance 暗示已签名。
7. 自动化 smoke 做了什么、没有做什么？原生功能验收不能被自动化安装检查替代。
8. 用户应到哪里查看升级、卸载、迁移恢复、已知限制和排障说明？

## 发布页面模板

工作流生成的正文必须至少按以下结构呈现：

1. 标题：CodeReader 版本号 发布说明 / Release Notes。
2. 候选版或稳定版状态。
3. 简体中文：支持范围、包选择、验证、未签名提示、自动化验证边界。
4. English：同等的支持范围、安装包选择、验证与签名说明。
5. 本次确切的十个安装包文件名。
6. 随附的 SHA256SUMS、SBOM、metadata、Release 正文和四份 native-smoke 文件说明。

发布说明不得包含用户绝对路径、源码、提示词、模型回答、密钥或本机诊断信息。

## 发布后的人工检查

自动化草稿生成后，维护者仍须在公开发布前：

1. 下载 Release 页面上的资产，而不是下载工作流临时 artifact。
2. 验证校验和和每个安装包的 artifact attestation。
3. 阅读四份 native-smoke 记录并确认标签、提交、架构和哈希均一致。
4. 在每个首发平台/架构执行文件选择、Markdown 阅读、数据库升级、解释生成、重启持久化和卸载验收。
5. 确认 Release 正文与 README.zh-CN.md 中的支持范围、未签名状态和已知限制一致。

只有这些检查完成后，草稿 Release 才可以发布。
