# CodeReader

CodeReader 是一个独立桌面端 AI 代码阅读 IDE，目标是把 AI 生成的代码从黑箱产物转化为可阅读、可解释、可审阅、可持久化、可逐步掌握的认知资产。

当前仓库已进入 MVP 收束阶段。单文件解释、SQLite 持久化、Context Builder、LLM 结构化生成、变更检测、真实项目树以及 JavaScript/TypeScript、Python、SQL 结构化解释链路已经完成；当前正在完成第一公里阅读引导与最终打包验收。

## 文档入口

正式项目文档：

- [项目文档包](<doc for app/README.md>)
- [产品设计文档](<doc for app/产品设计文档.md>)
- [需求文档](<doc for app/需求文档.md>)
- [技术架构与技术路线](<doc for app/技术架构与技术路线.md>)
- [MVP 实现标准](<doc for app/MVP实现标准.md>)
- [协议与治理](<doc for app/协议与治理.md>)
- [启动前检查报告 v0.4](<doc for app/启动前检查报告_v0.4.md>)

开发辅助资料：

- [MVP 开发任务 Prompt v0.4](<完善文档与prompt整理/CodeReader_MVP开发任务Prompt_v0.4.md>)
- [启动前约束与检查](<完善文档与prompt整理/启动前约束与检查.md>)
- [本地 Git 管理文档](<完善文档与prompt整理/git管理文档.md>)

归档资料：

- [历史归档说明](<archive/README.md>)
- [VS Code 插件旧方向归档](<archive/for VS Code Extension/ARCHIVE.md>)

## MVP 启动边界

MVP 只验证最小阅读闭环：

```text
打开代码 -> 看见结构 -> 点击行/块/函数 -> 看到稳定解释 -> 用户标记理解 -> 解释被保存 -> 代码变更后提示过期
```

MVP 不做 VS Code 插件主产品、不做聊天工具主入口、不做完整项目知识图谱、不做团队协作、不做云同步、不做自动代码修复。

## 本地 Git 规则

本项目采用本地 Git 优先策略：

- `main`：稳定基线；
- `dev`：日常开发分支；
- `feature/*`：单任务功能分支。

日常开发建议：

```bash
git status
git checkout dev
git checkout -b feature/task-name
```

AI 或人工修改前，如果当前状态已经稳定，先提交检查点：

```bash
git add .
git commit -m "checkpoint: before task-name"
```

修改后先看状态和 diff，再提交：

```bash
git status
git diff
git add .
git commit -m "feat: implement task-name"
```

## 当前阶段标签

- `v0.1-docs-ready`：文档与启动约束准备完成；
- `v0.2-app-shell`：Tauri + React 桌面骨架；
- `v0.3-code-viewer`：Monaco 阅读区；
- `v0.5-single-file-mvp`：单文件解释闭环；
- `v0.6-change-detection`：变更检测与解释过期；
- `v0.7-project-tree`：真实项目文件树与安全预览；
- `v0.8-python-support`：Python 结构化解释；
- `v0.9-sql-support`：SQL 结构化解释；
- `v0.10-first-mile`：推荐阅读路径、轻量项目地图、阅读进度和三文件示例。

`v0.10-first-mile` 完成后，下一阶段只做 MVP 打包、安装与总验收，不借机扩张完整知识图谱或聊天入口。
