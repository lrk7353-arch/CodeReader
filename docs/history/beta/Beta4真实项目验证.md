# Beta 4 真实项目验证

阶段：Beta 4 主线 2

目标：证明 CodeReader 在真实项目上能连续完成阅读闭环。验证重点是用户能不能完成阅读，而不只是测试能不能通过。

## 当前状态

本文目前是 Beta4 真实项目验证模板，尚未填入真实小型 / 中型 / 压力样本记录。填写记录前，不得把主线 2 标记为“真实项目验证完成”。

## 样本要求

至少 3 组样本，覆盖不同规模：

| 类型     | 规模                                            | 重点观察                           |
| -------- | ----------------------------------------------- | ---------------------------------- |
| 小型     | 几十个文件以内                                  | 基础闭环、首文件加载稳定性         |
| 常规中型 | 数百文件 / 多语言结构                           | 扫描耗时、长结构列表、跨文件阅读   |
| 压力项目 | 长文件 / 超多函数类 / 深目录 / 含二进制或大文件 | 大文件边界、结构列表淹没、跳过原因 |

## 记录指标

每个样本记录：

### 扫描阶段

- 扫描耗时（秒）
- 文件总数
- 可预览数量
- 不可预览数量
- 跳过原因分布（二进制 / 超大 / 编码 / symlink）
- 是否触发 `truncated`（深目录 / 超 10000 条目）

### 文件加载

- 首个可读文件加载是否稳定
- 结构列表是否可用
- 长列表是否影响回到项目结构

### 解释生成

- 生成成功 / 失败
- 失败码（`llm.timeout` / `llm.connection` / `llm.invalid_response` 等）
- 是否覆盖旧解释（失败不应覆盖）
- 重试行为

### 刷新与迁移

- 刷新后解释是否正确迁移
- 标 stale / 标 deleted / 保留历史 是否符合预期

## 证据模板

每组样本填一份：

```json
{
  "sample": "小型/中型/压力",
  "projectName": "（脱敏，不含源码）",
  "fileCount": 0,
  "scanSeconds": 0,
  "previewable": 0,
  "unpreviewable": 0,
  "skipReasons": {},
  "truncated": false,
  "firstFileStable": null,
  "structureListUsable": null,
  "longListSqueezesProjectTree": null,
  "generationSuccess": 0,
  "generationFailed": 0,
  "failureCodes": {},
  "overwriteOnFailure": null,
  "refreshMigrationCorrect": null,
  "notes": ""
}
```

## 脱敏边界

- 不记录真实项目源码
- 不记录 API Key
- 不记录完整 prompt 或模型响应
- 项目名可脱敏（如"中型 TypeScript 项目 A"）

## 合成 fixture

如仓库中不能放真实项目源码，可用合成 fixture 覆盖边界：

- 长文件 fixture（数千行）
- 多函数/类 fixture（数百节点）
- 非 UTF-8 / 二进制 fixture
- 深目录 fixture

合成 fixture 必须不含第三方项目源码或敏感数据。

## 脱敏记录（Beta4 首份）

### 样本 1：小型项目（CodeReader 仓库自身）

用 CodeReader 仓库自身作为脱敏小项目样本（不涉及第三方源码）。

```json
{
  "sample": "小型",
  "projectName": "CodeReader 仓库自身（脱敏）",
  "fileCount": 193,
  "scanSeconds": null,
  "previewable": 109,
  "unpreviewable": 84,
  "skipReasons": {
    "markdown/doc": 40,
    "json/config": 30,
    "powershell": 6,
    "image/binary": 2,
    "other": 6
  },
  "truncated": false,
  "firstFileStable": null,
  "structureListUsable": null,
  "longListSqueezesProjectTree": null,
  "generationSuccess": 0,
  "generationFailed": 0,
  "failureCodes": {},
  "overwriteOnFailure": null,
  "refreshMigrationCorrect": null,
  "notes": "静态统计（git ls-files），未通过桌面端 scan_project 命令实时执行。109 个代码文件（.ts/.tsx/.rs/.py/.mjs）可预览，84 个非代码文件跳过。scanSeconds/firstFileStable/structureListUsable 等需桌面端实时执行后填入。"
}
```

> 诚实说明：本记录的 `fileCount`/`previewable`/`unpreviewable`/`skipReasons` 来自 `git ls-files` 静态统计，未经桌面端 `scan_project` 命令实时验证。`scanSeconds`/`firstFileStable`/`structureListUsable`/`longListSqueezesProjectTree`/`generationSuccess`/`generationFailed`/`refreshMigrationCorrect` 需在桌面端真实执行后填入。中型/压力样本使用合成 fixture（见下），真实项目验证需后续真实执行。

### 样本 2：中型项目（合成 fixture）

合成 fixture，非真实第三方源码。`src/data/syntheticProjectFixtures.ts` 的 `mediumProjectFixture`。

```json
{
  "sample": "中型（合成）",
  "projectName": "medium-multilang（合成 fixture）",
  "fileCount": 120,
  "scanSeconds": null,
  "previewable": 120,
  "unpreviewable": 0,
  "skipReasons": {},
  "truncated": false,
  "firstFileStable": null,
  "structureListUsable": null,
  "longListSqueezesProjectTree": null,
  "generationSuccess": 0,
  "generationFailed": 0,
  "failureCodes": {},
  "overwriteOnFailure": null,
  "refreshMigrationCorrect": null,
  "notes": "合成 fixture：60 个 TS + 30 个 Python + 15 个 SQL + 10 个 Markdown + 5 个 JSON。部分文件 800+ 行。用于测试多语言结构和中等规模扫描。真实 scanSeconds/structureListUsable 需桌面端执行。"
}
```

### 样本 3：压力项目（合成 fixture）

合成 fixture，非真实第三方源码。`src/data/syntheticProjectFixtures.ts` 的 `stressProjectFixture`。

```json
{
  "sample": "压力（合成）",
  "projectName": "stress-longfiles-deepdirs（合成 fixture）",
  "fileCount": 13,
  "scanSeconds": null,
  "previewable": 11,
  "unpreviewable": 2,
  "skipReasons": {
    "binary": 1,
    "invalid_utf8": 1
  },
  "truncated": false,
  "firstFileStable": null,
  "structureListUsable": null,
  "longListSqueezesProjectTree": null,
  "generationSuccess": 0,
  "generationFailed": 0,
  "failureCodes": {},
  "overwriteOnFailure": null,
  "refreshMigrationCorrect": null,
  "notes": "合成 fixture：1 个 3000 行文件、1 个 200+ 结构节点文件、1 个二进制、1 个非 UTF-8、8 层深目录。用于测试大文件边界、长结构列表、跳过原因、深目录。真实 scanSeconds/structureListUsable/longListSqueezesProjectTree 需桌面端执行。"
}
```

> 合成 fixture 覆盖自动化测试边界（文件数/语言/大小/跳过原因/深目录），但不替代真实项目验证。真实中型/压力项目的 `scanSeconds`/`firstFileStable`/`structureListUsable`/`longListSqueezesProjectTree`/`generationSuccess`/`generationFailed`/`refreshMigrationCorrect` 仍需在桌面端用真实项目执行后填入。
