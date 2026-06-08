# CodeReader 本地 Git 管理文档

> 文档目的：为 CodeReader 项目建立一套简单、稳定、可回滚、可监督 AI 改动的本地 Git 管理规则，避免项目目录出现“重复、混乱、无法回退、文件堆积”的问题。

---

## 1. 基本原则

CodeReader 在启动阶段采用：

```text
本地 Git 优先，GitHub 私有仓库后置。
```

也就是说，项目一开始不强制依赖 GitHub，但必须从第一天开始使用本地 Git。

本地 Git 的作用是：

- 记录每一次重要修改；
- 监督 Codex / AI 工具到底改了什么；
- 在 AI 改坏项目时快速回滚；
- 防止项目目录重复、混乱、不可控；
- 保留每个阶段的稳定版本；
- 为后续上传 GitHub 私有仓库做好准备。

GitHub 的作用是：

- 远程备份；
- 跨设备同步；
- 后续协作；
- Issue / Release / Actions 管理；
- 给更多 AI coding agent 接入项目。

但在 MVP 启动阶段，**本地 Git 已经足够完成版本监督、变化管控和回滚。**

---

## 2. 项目目录初始化规则

建议 CodeReader 项目目录保持简单：

```text
CodeReader/
├── docs/                 # 产品文档、需求文档、开发约束文档
├── examples/             # 内置示例代码
├── src/                  # 前端源码
├── src-tauri/            # Tauri 后端与桌面端配置
├── scripts/              # 辅助脚本
├── tests/                # 测试文件
├── .gitignore
├── README.md
├── package.json
└── pnpm-lock.yaml / package-lock.json / yarn.lock
```

如果当前还没有代码，只先放文档，也可以这样：

```text
CodeReader/
├── docs/
│   ├── 产品设计文档.md
│   ├── 需求文档.md
│   ├── 技术架构与技术路线.md
│   ├── MVP实现标准.md
│   ├── 协议与治理.md
│   ├── 启动前约束与检查.md
│   └── git管理文档.md
├── README.md
└── .gitignore
```

---

## 3. 初始化 Git 仓库

在 CodeReader 项目根目录执行：

```bash
git init
```

确认当前状态：

```bash
git status
```

添加文件并提交初始版本：

```bash
git add .
git commit -m "chore: initialize CodeReader repository"
```

这次提交的意义是建立第一个稳定基线。后续任何 AI 或人工修改，都可以回到这个基线之后的某个版本。

---

## 4. `.gitignore` 规则

在项目根目录创建 `.gitignore`。

建议内容如下：

```gitignore
# dependencies
node_modules/

# build outputs
dist/
build/
out/
coverage/
src-tauri/target/

# environment files
.env
.env.local
.env.*.local

# logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*

# OS files
.DS_Store
Thumbs.db

# editor settings
.vscode/
.idea/

# local databases
*.sqlite
*.sqlite3
*.db

# local cache and temp files
.cache/
.temp/
tmp/
temp/

# AI temporary files
*.tmp
*.bak
*.backup
*.old

# packaged apps
*.dmg
*.exe
*.msi
*.AppImage
*.deb
*.rpm

# Rust / Tauri generated files
src-tauri/target/

# macOS app bundles
*.app/
```

### 注意

如果以后需要把示例数据库、演示数据纳入版本控制，不要直接把本地真实数据库提交进去，而是放到：

```text
examples/
fixtures/
sample-data/
```

并用明确文件名区分：

```text
examples/demo-explanations.sample.json
examples/demo-project.sample.sqlite
```

---

## 5. 分支策略

CodeReader 早期不需要复杂 Git Flow。建议使用简单三层结构。

### 5.1 `main` 分支

稳定主分支。

规则：

- 只放能运行、能回退、相对稳定的版本；
- 不直接在 `main` 上做大改动；
- 每个阶段完成后再合并到 `main`；
- 可以给重要版本打 tag。

```text
main = 稳定版本
```

---

### 5.2 `dev` 分支

日常开发分支。

规则：

- Codex / AI 工具主要在 `dev` 或 feature 分支上工作；
- `dev` 可以不完全稳定，但应尽量保持可运行；
- 每完成一个小阶段，提交一次。

创建方式：

```bash
git checkout -b dev
```

```text
dev = 当前开发进度
```

---

### 5.3 `feature/*` 分支

单个功能开发分支。

示例：

```bash
git checkout -b feature/monaco-editor
```

常见分支名：

```text
feature/app-shell
feature/monaco-editor
feature/file-open
feature/sqlite-persistence
feature/tree-sitter-parser
feature/explanation-panel
feature/llm-generation
feature/change-detection
feature/demo-examples
```

功能完成后，合并回 `dev`：

```bash
git checkout dev
git merge feature/monaco-editor
```

确认没问题后可删除本地 feature 分支：

```bash
git branch -d feature/monaco-editor
```

---

## 6. 推荐开发流程

每次开发一个任务，遵循下面流程。

### 6.1 开始前确认状态干净

```bash
git status
```

如果显示有未提交内容，先判断是否需要提交或丢弃。

不建议在工作区混乱时让 AI 工具继续改代码。

---

### 6.2 开始新功能前创建分支

```bash
git checkout dev
git checkout -b feature/sqlite-persistence
```

---

### 6.3 让 Codex / AI 工具修改前先做检查点

如果当前代码已经是一个可运行状态，先提交检查点：

```bash
git add .
git commit -m "checkpoint: before sqlite persistence"
```

这一步非常重要。它相当于给 AI 修改前系一根安全绳。

---

### 6.4 AI 修改后先检查，不要立刻提交

查看哪些文件被改了：

```bash
git status
```

查看具体改动：

```bash
git diff
```

如果改动很多，可以逐个文件查看：

```bash
git diff path/to/file
```

---

### 6.5 能运行后再提交

确认项目能运行、功能符合预期后：

```bash
git add .
git commit -m "feat: implement sqlite persistence"
```

---

### 6.6 合并回 dev

```bash
git checkout dev
git merge feature/sqlite-persistence
```

---

## 7. 提交信息规范

提交信息建议使用简短英文，格式：

```text
类型: 做了什么
```

常用类型：

| 类型 | 用途 | 示例 |
|---|---|---|
| `feat` | 新功能 | `feat: add monaco editor viewer` |
| `fix` | 修复问题 | `fix: restore explanation after reload` |
| `docs` | 文档 | `docs: add git management guide` |
| `chore` | 配置、依赖、杂项 | `chore: update project config` |
| `refactor` | 重构 | `refactor: simplify explanation panel state` |
| `test` | 测试 | `test: add parser tests` |
| `style` | 样式 | `style: polish sidebar layout` |
| `schema` | 数据库结构 | `schema: add explanation tables` |
| `checkpoint` | 检查点 | `checkpoint: before llm integration` |
| `revert` | 回滚 | `revert: undo broken tree-sitter change` |

推荐示例：

```bash
git commit -m "docs: add pre-launch checklist"
git commit -m "feat: add line selection in monaco editor"
git commit -m "schema: add explanation persistence tables"
git commit -m "fix: mark stale explanations after file change"
git commit -m "checkpoint: before integrating tree-sitter"
```

不推荐：

```bash
git commit -m "改了一下"
git commit -m "update"
git commit -m "111"
git commit -m "新版本"
git commit -m "乱七八糟先提交"
```

---

## 8. AI 辅助开发的特殊规则

CodeReader 是 AI 辅助开发项目，所以 Git 管理要更严格。

### 8.1 一次只让 AI 做一个任务

推荐：

```text
请只完成 Monaco Editor 的集成，不要修改 SQLite、Tree-sitter、LLM 相关代码。
```

不推荐：

```text
帮我把整个 CodeReader MVP 都做了。
```

---

### 8.2 每次 AI 修改前必须有干净提交

执行：

```bash
git status
```

如果工作区不干净，先处理。

---

### 8.3 AI 改完后必须看 diff

执行：

```bash
git diff
```

重点看：

- 有没有改到不相关文件；
- 有没有删除重要代码；
- 有没有生成重复文件；
- 有没有把配置写乱；
- 有没有引入不必要依赖；
- 有没有把密钥或本地路径写入代码。

---

### 8.4 不允许 AI 随意新增重复目录

禁止出现：

```text
CodeReader-v2/
CodeReader-new/
CodeReader-final/
backup/
old/
copy/
临时版本/
```

如果需要备份，用 Git，不用复制整个项目目录。

---

### 8.5 AI 生成的大段临时文件不要提交

例如：

```text
*.tmp
*.bak
*.old
临时说明.txt
未整理方案.md
```

需要保留的文档统一放入：

```text
docs/
```

需要保留的示例统一放入：

```text
examples/
```

---

## 9. 回滚与恢复规则

### 9.1 丢弃未提交修改

如果 AI 改坏了，而且还没有提交，可以执行：

```bash
git restore .
```

这会丢弃所有未提交的文件修改。

如果还新增了未跟踪文件，可以先查看：

```bash
git status
```

删除未跟踪文件：

```bash
git clean -fd
```

谨慎使用 `git clean -fd`，它会删除未被 Git 跟踪的文件。

---

### 9.2 回到上一个提交

如果已经提交，但想回到上一个提交：

```bash
git reset --hard HEAD~1
```

这会删除最近一次提交及其修改。谨慎使用。

---

### 9.3 只撤销某个文件

```bash
git restore path/to/file
```

---

### 9.4 查看历史版本

```bash
git log --oneline
```

示例输出：

```text
f3a1b2c feat: add monaco editor viewer
9d2c8e1 docs: add git management guide
7a8b4d0 chore: initialize CodeReader repository
```

---

### 9.5 回到某个历史版本查看

```bash
git checkout commit_id
```

例如：

```bash
git checkout f3a1b2c
```

查看完后回到当前分支：

```bash
git checkout dev
```

---

## 10. 标签管理

每完成一个重要阶段，可以打 tag。

示例：

```bash
git tag v0.1-docs-ready
```

```bash
git tag v0.2-app-shell
```

```bash
git tag v0.3-single-file-mvp
```

查看所有 tag：

```bash
git tag
```

建议 CodeReader 使用以下 tag：

| Tag | 含义 |
|---|---|
| `v0.1-docs-ready` | 文档与启动约束准备完成 |
| `v0.2-app-shell` | 桌面应用骨架完成 |
| `v0.3-code-viewer` | Monaco 代码阅读器完成 |
| `v0.4-persistence` | 解释层持久化完成 |
| `v0.5-single-file-mvp` | 单文件解释闭环完成 |
| `v0.6-change-detection` | 代码变更检测完成 |

---

## 11. 本地 Git 与 GitHub 的衔接

启动阶段可以只使用本地 Git。

当项目骨架稳定后，建议创建 GitHub 私有仓库。

关联远程仓库：

```bash
git remote add origin git@github.com:你的用户名/CodeReader.git
git branch -M main
git push -u origin main
```

如果当前主要开发在 `dev` 分支，也推送 dev：

```bash
git push -u origin dev
```

之后日常操作：

```bash
git push
```

GitHub 只作为远程备份和后续协作入口，不改变本地 Git 的核心管理规则。

---

## 12. 每日开发检查清单

每天开始前：

```bash
git status
```

确认：

- 当前在哪个分支；
- 是否有未提交修改；
- 是否需要先提交检查点；
- 今天要做的任务是否足够小。

每天结束前：

```bash
git status
git log --oneline -5
```

确认：

- 今天的有效成果是否已经提交；
- 项目是否能运行；
- 是否有临时文件未处理；
- 是否需要打 tag；
- 是否需要推送到 GitHub 私有仓库。

---

## 13. 每个任务的 Git 操作模板

开始任务：

```bash
git checkout dev
git status
git checkout -b feature/task-name
```

AI 修改前：

```bash
git add .
git commit -m "checkpoint: before task-name"
```

AI 修改后检查：

```bash
git status
git diff
```

确认可运行后提交：

```bash
git add .
git commit -m "feat: implement task-name"
```

合并回 dev：

```bash
git checkout dev
git merge feature/task-name
```

删除 feature 分支：

```bash
git branch -d feature/task-name
```

---

## 14. 文件整理规则

### 14.1 文档

所有正式文档放在：

```text
docs/
```

文档命名使用中文或英文都可以，但要清楚：

```text
docs/产品设计文档.md
docs/需求文档.md
docs/技术架构与技术路线.md
docs/MVP实现标准.md
docs/启动前约束与检查.md
docs/git管理文档.md
```

### 14.2 示例代码

所有示例代码放在：

```text
examples/
```

建议结构：

```text
examples/
├── small-30-lines/
├── medium-100-lines/
└── large-200-lines/
```

### 14.3 临时文件

不要保留在项目根目录。

临时文件需要立刻删除，或者放入：

```text
tmp/
```

但 `tmp/` 不进入 Git。

---

## 15. 禁止事项

为了避免项目变乱，禁止以下行为：

1. 禁止复制多个项目目录作为备份；
2. 禁止出现 `final`、`new`、`copy`、`backup` 这类重复目录；
3. 禁止在未提交状态下连续让 AI 做多个大任务；
4. 禁止不看 diff 就提交；
5. 禁止把 `.env`、API Key、本地数据库提交到 Git；
6. 禁止把构建产物、缓存、依赖目录提交到 Git；
7. 禁止一次提交混合多个无关功能；
8. 禁止把聊天记录当正式文档随意丢进根目录；
9. 禁止让 AI 自行决定重构整个项目结构；
10. 禁止在 `main` 分支直接进行高风险实验。

---

## 16. CodeReader 早期推荐节奏

### 第 0 步：文档与 Git 初始化

```bash
git init
git add .
git commit -m "docs: initialize CodeReader planning documents"
git tag v0.1-docs-ready
```

### 第 1 步：应用骨架

```bash
git checkout -b dev
git checkout -b feature/app-shell
```

完成后：

```bash
git add .
git commit -m "feat: initialize tauri react app shell"
git checkout dev
git merge feature/app-shell
git tag v0.2-app-shell
```

### 第 2 步：Monaco 代码阅读器

```bash
git checkout -b feature/monaco-editor
```

完成后：

```bash
git commit -m "feat: add monaco editor code viewer"
```

### 第 3 步：解释层持久化

```bash
git checkout -b feature/explanation-persistence
```

完成后：

```bash
git commit -m "schema: add explanation persistence model"
```

### 第 4 步：单文件 MVP 闭环

目标：

```text
打开文件 → 显示代码 → 点击行/函数 → 显示解释 → 保存解释 → 重开仍在
```

完成后：

```bash
git tag v0.5-single-file-mvp
```

---

## 17. 最小启动命令汇总

如果你现在要立刻开始，只需要执行：

```bash
cd CodeReader
git init
```

创建 `.gitignore` 后：

```bash
git add .
git commit -m "docs: initialize CodeReader planning documents"
git checkout -b dev
git tag v0.1-docs-ready
```

之后每次开发都从 `dev` 分支开 feature 分支。

---

## 18. 最终结论

CodeReader 启动阶段的 Git 管理策略是：

```text
本地 Git 必须做。
GitHub 私有仓库建议后续尽早做，但不是第一天必须。
```

本地 Git 的核心目标不是炫技，而是让项目做到：

- 每一步都可追踪；
- 每次 AI 修改都可审查；
- 每个阶段都可回滚；
- 项目目录始终干净；
- 不再通过复制文件夹管理版本；
- 不再出现重复、混乱、难以维护的项目状态。

CodeReader 的开发必须从一个干净、可控、可回退的 Git 基线开始。
