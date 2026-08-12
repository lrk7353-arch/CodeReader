# R1 认知状态、兼容映射与迁移回退

**状态：** Accepted；R1 代码与自动化监督已通过

**数据库版本：** 5

`CognitionState` 是新界面和聚合的唯一状态源：`visitState` 为 `unread|read`，`masteryState` 为 `unconfirmed|understood`，`reviewState` 为 `current|needs_review`。笔记、问题和风险是 `UserAnnotation`，不再伪装为阅读状态。

| 事件 | 允许变化 | 禁止变化 |
| --- | --- | --- |
| 打开/访问目标 | `visitState=read` | 掌握度、复查状态、用户标注 |
| 模型生成解释 | 解释内容/版本 | 三个认知字段，尤其不得增加 `understood` |
| 用户确认理解 | `visitState=read`、`masteryState=understood` | 其他用户标注 |
| 代码或解释依据变化 | `reviewState=needs_review` | 自动确认理解或删除历史记录 |

唯一一级百分比是路径掌握度：路径中 `masteryState=understood` 的节点数除以路径节点总数。文件/项目局部统计必须标明范围，不能充当一级百分比。

## 兼容投影

旧 `ReadingState`、`user_reading_states.state` 与 `save_reading_state` 继续存在。导入映射为：`unread→unread/unconfirmed/current`，`read→read/unconfirmed/current`，`understood→read/understood/current`，`needs_reexplain→read/unconfirmed/needs_review`；`questioned` 与 `suspicious` 同时分别回填 question/risk 标注。投影优先顺序维持旧消费者习惯：question/risk（旧记录）→需复查→已理解→已读→未读。

## 迁移与回退

v5 仅向 `user_reading_states` 增加三个字段，并新增 `user_annotations`、`project_reader_preferences`、`explanation_relationships`。旧 `note`、`explanation_feedback.user_note` 被复制为标注，原列和记录保留。现有启动路径先备份、在事务内迁移、检查 schema/SQLite 完整性；失败回滚并恢复备份。回退到旧应用时，旧应用继续读取未改变的 `state` 与旧表；v5 新数据只会被旧应用忽略。

## 写入边界与并发

`UserAnnotation`、`ReaderPreference` 和 `RelatedTarget` 的 CRUD 在 Rust 中重新校验 project 和 explanation 目标。关系两端必须属于同一项目；前端路径不授予写入权限。

`save_cognition_state` 以事务检查 `expectedRevision`。前端按 `(project, explanation)` 串行写入，并使用前一次成功保存的 revision，因此快速的状态切换保持“最后意图优先”。

Desktop project guidance reads `visit_state`、`mastery_state`、`review_state` directly and returns a cognition state for every path step plus the path-only `masteryPercent`; it never derives primary mastery from legacy `state`. Generated explanations reload through the same hydration mapping after commit, preserving cognition, revision, and annotations. Only IDs beginning `annotation:legacy-state:` participate in legacy state projection; new question/risk annotations remain orthogonal. Request re-explain preserves visit/mastery and queues a `needs_review` cognition write on the same revision chain.

Legacy IPC deduplication checks only an existing legacy-state marker with the same kind, never a same-kind new annotation. Guidance counts `understood` from `mastery_state`, `needsReexplain` from `review_state`, and `read` from `visit_state`; those dimensions intentionally overlap so an understood target that needs review remains visible in both applicable summaries.

R1 的代码、兼容迁移和自动化监督已经通过。原生桌面恢复、真实项目可用性、无障碍和完整发布矩阵仍由 R2--R5 验证，本结论不得外推为产品复位或公开发布完成。

## R1 测试表

- 旧状态六值映射和投影优先级；正交组合与路径分母。
- 生成解释不改变掌握度；旧 IPC 与新认知保存保持 `state` 同步。
- v0.10/v0.11 fixture 的备份、事务迁移、重复执行和失败回滚。
- 标注、偏好、关系 CRUD；跨路径/文件树/解释面板的相同认知表达。
- 诊断与错误路径不导出用户标注、源码、提示词、模型响应、凭据或绝对路径；异步结果仍以现有 operation gate 保护。
