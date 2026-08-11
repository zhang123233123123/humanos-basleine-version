# HumanOS 正式 UX 流程实现基线

## 1. 文档用途

本文是 `plan.md` 的 Step 0 交付物，用于冻结 2026-08-11 时 HumanOS 的实际实现，并将其与 `HumanOS_UX_End_to_End_Flow_CN.docx` 对照。

状态定义：

- `已实现`：页面、接口、持久化和主要状态链路均存在。
- `部分实现`：已有主要能力，但流程、状态或界面没有完整闭环。
- `缺失`：正式流程要求存在，但当前没有对应的正式能力。
- `偏离`：当前行为与正式 UX 原则冲突，需要调整而不是简单补充。

## 2. 当前应用边界

- 正式前端：`frontend/src/`
- 正式后端：`backend/humanos_server.py`、`backend/humanos_graph.py`
- 前端入口：`/app`
- 后端事实来源：SQLite Store 与 Python API
- 历史参考目录：`calendar-ai/`，不作为生产实现
- 前端访问方式：浏览器调用同源 `/api/*`，Next.js Route Handler 再代理至后端 `8787`

## 3. 当前页面基线

| 正式领域 | 当前页面 | 状态 | 主要差异 |
|---|---|---:|---|
| 登录/注册 | `/login` | 部分实现 | 登录使用 NextAuth，注册经 Python 后端；仍需验证所有业务资源是否稳定使用同一 `user_id`。 |
| 首次设置 | `/app/onboarding` | 部分实现 | 页面存在，但尚未证明四步信息完整、可恢复且完成后自动进入已生成 Draft Plan。 |
| Calendar Workspace | `/app` | 部分实现 | AI Chat、Calendar 和任务审查存在，但仍混有重复导航、任务事实确认和计划确认语义。 |
| Weekly Plan | `/app/plan` | 部分实现 | 已有 reconcile、decide、validate、confirm、rollover；与首次设置和 Calendar 的连续引导不足。 |
| Tasks | 无独立正式页面 | 缺失 | `/app/tasks` 和 `/app/tasks/{task_id}` 不存在，任务详情主要依赖 Calendar 弹层。 |
| Focus | `/app/focus` | 部分实现 | 已有 Session 执行动作，但 Break、Switch、Resume 和冲突处理尚未形成正式闭环。 |
| Daily Check-in | `/app/check-in` | 部分实现 | 页面和 API 存在；每日首次进入触发、一天一次限制和仅影响下一个 Session 仍需统一验证。 |
| Insights | `/app/insights` | 部分实现 | Candidate、Promote、Memory Search 已有；缺少 Edit、Dismiss、Forget 和完整 Recent Observations。 |
| Settings/Profile | `/app/settings` | 部分实现 | Profile API 存在；正式信息架构、Working Rhythm、Scheduling、Notifications、Privacy 仍需统一。 |
| QA | `/app/qa` | 已实现 | 能力检查、测试时钟、场景加载与重置存在，必须继续保持测试账号权限隔离。 |
| Developer | `/app/developer` | 已实现 | 可查看 Profile、Plan、Session、Transition 等原始字段；它不能代替用户 Insights。 |

## 4. API 与资源基线

| 领域 | 当前后端能力 | 前端代理 | 状态 | 缺口 |
|---|---|---:|---:|---|
| Profile | `GET/PUT /api/profile` | 有 | 已实现 | 需统一首次建模完整性和长期/短期数据边界。 |
| Authentication | register、login | 有 | 部分实现 | NextAuth identity 与业务 `user_id` 需要专项核对。 |
| Tasks | list/create/get/patch/delete/parse | 集合代理为主 | 部分实现 | 缺独立 Task 页面及清晰的 preview/persisted/scheduled 状态表达。 |
| Chat | turn、turns | `/api/chat` | 部分实现 | 助手模式与正式 Calendar Diff/Apply/Cancel 语义需要统一。 |
| Weekly Context | reconcile、week status、rollover | 有 | 部分实现 | 首次、每日、新周三个入口尚未组成连续生命周期。 |
| Planning | decide、validate、confirm、active、proposed、revise、adjust-task | 有 | 部分实现 | 修改确认后的 revision/session 原子同步仍是重点风险。 |
| Calendar | Task + Session 投影 | 有 | 部分实现 | 未排期 Task 不显示的原因缺少明确提示；Draft/Confirmed 表达需统一。 |
| Execution | list/current/ensure/start/pause/impact/end | 有 | 部分实现 | `ensure` 可能绕过正式确认；缺少明确 Break、Resume、Switch 动作。 |
| Feedback | execution-feedback | 有 | 部分实现 | Finish 后 Remaining Work、局部重排和反馈分类需完整串联。 |
| Context/Re-entry | context-dumps、reentry | 有 | 部分实现 | UI 尚未完整覆盖 expected resume、冲突选项和 Calendar Diff。 |
| State | state-checkins、state-transitions | 有 | 部分实现 | Check-in 影响范围及日期幂等需要统一。 |
| Memory/Pattern | search、candidates、promote | 有 | 部分实现 | 缺少 observation 管理以及 pattern edit/dismiss/forget。 |
| QA | capabilities、test-clock、scenarios | 有 | 已实现 | 持续保证普通账号不可见、不可调用。 |

## 5. 持久化对象基线

当前后端已经具备以下主要存储对象：

- `profiles`
- `users`
- `tasks`
- `runtime_states`
- `context_dumps`
- `memories`
- `events`
- `chat_turns`
- `execution_feedback`
- `state_transitions`
- `plans`
- `weekly_context_history`
- `plan_edit_episodes`
- `plan_edit_events`
- `plan_change_rationales`
- `execution_sessions`
- `execution_requests`

结论：后端并不缺少主要资源，当前主要问题是资源之间的生命周期约束和前端流程表达不完整，而不是需要重新建立一套平行数据模型。

## 6. 正式旅程差异矩阵

| 阶段 | 文档目标 | 当前判断 | 后续 Step |
|---|---|---:|---:|
| Profile 建模 | 四步完成长期与本周基础 | 部分实现 | Step 1、2 |
| Tasks 输入 | 稳定解析、确认任务事实 | 部分实现 | Step 3 |
| Draft Plan | AI 排具体时间、Python 验证 | 部分实现 | Step 4 |
| Calendar 审查 | 三栏工作台、整份确认 | 偏离 | Step 5 |
| Plan 修改 | Diff、Revision、Session 同步 | 部分实现/高风险 | Step 6 |
| Focus 执行 | 唯一 Active Session、后端计时 | 部分实现 | Step 7 |
| Pause/Resume | Context Dump、真实时间冲突检查 | 部分实现 | Step 8 |
| Finish/Feedback | Actual Time、Remaining Work、局部重排 | 部分实现 | Step 9 |
| Daily/Weekly | 每日轻量检查、新周迁移 | 部分实现 | Step 10 |
| Insights | Observation、Candidate、Confirmed | 部分实现 | Step 11 |
| 全局 UI | 统一导航、中英文、响应式 | 部分实现 | Step 12 |
| 生产闭环 | 全业务回归和版本一致性 | 未建立正式发布门槛 | Step 13 |

## 7. 已确认的关键偏差

### 7.1 两种确认语义没有清楚分开

当前 Workspace 同时承担 AI 解析结果确认和计划确认。正式流程允许先确认 Task 事实，再确认 Plan 时间，但必须使用不同文案和视觉状态：

- `保存任务信息`：Task 从 Preview 变成 Persisted/Ready。
- `确认本周计划`：Proposed Slots 变成 Confirmed Plan，并生成 Execution Sessions。

禁止把两者都写成“确认加入日历”。

### 7.2 未排期任务缺少正式去向

只有 Deadline、没有 Session 的 Task 不应伪装成 Calendar Event，但页面必须显示：

```text
任务已保存，尚未安排时间。
```

用户应能从 Tasks 或 Plan Review 找到它并生成计划，而不是看到空日历后误认为解析失败。

### 7.3 `ensure execution session` 存在绕过风险

Workspace 可以在启动任务前请求 `execution-sessions/ensure`。如果它允许从未确认 Task 临时制造 Session，就会绕过正式的 Proposed -> Validate -> Confirm 流程。Step 6/7 必须确定：

- 正式 Session 只能来源于 Confirmed Plan；或
- 临时立即执行必须形成明确的 ad-hoc revision，并经过后端约束检查。

### 7.4 运行时动作不完整

后端当前具备 start、pause、impact、end，但正式 UX 还需要区分：

- Break：正常短休息，不询问暂停原因。
- Pause：保存 Context Dump。
- Resume：按真实时间检查影响。
- Switch：保留原 Task 上下文并推荐 Ready Queue。

不能继续用单一状态切换模拟四种不同业务动作。

### 7.5 Pattern 管理只实现了单向提升

当前用户可以确认候选 Pattern，但还不能完整 Edit、Dismiss 或 Forget。正式流程要求用户能够纠正和撤销系统学习结果，撤销后后续 Prompt 不再使用。

### 7.6 正式导航与页面集合不完整

文档要求 Workspace、Weekly Plan、Tasks、Focus、Insights、Settings。当前缺少 Tasks 与 Task Detail 正式页面，并仍存在悬浮 Dock/侧栏重复导航，需要在 Step 5 和 Step 12 统一。

## 8. 风险优先级

### P0：先解决

- 登录身份与业务数据 key 不一致。
- 确认后 Plan Revision 与 Execution Session 不同步。
- 前端自行计算、顺延或保留已经被后端替换的 Session。
- 未确认计划通过 `ensure` 直接产生正式可执行 Session。

### P1：主流程完整性

- 首次 Profile/Weekly Context 不完整仍可生成计划。
- Task 解析成功但用户无法在 Tasks/Plan Review 中找到未排期工作。
- Pause/Resume 缺少 Context Dump 和真实冲突决策。
- Daily Check-in 与 Week Rollover 未成为显式生命周期入口。

### P2：体验和可控学习

- Calendar 三栏布局、重复导航和按钮遮挡。
- Insights 缺少 Edit、Dismiss、Forget。
- 设置页面、中英文和月视图统一。
- 桌宠、通知和长期摘要的完整体验。

## 9. 接口契约统一要求

后续所有 Step 必须遵守：

1. 前端只调用同源 `/api/*`。
2. Route Handler 使用同一 signed-in `user_id`，不能临时改用邮箱。
3. 后端边界保持 `snake_case`；转换必须集中在契约适配层。
4. 时间字段使用带时区的绝对时间，`deadline` 不推断 `start_at`。
5. 所有写操作返回持久化后的资源和明确 revision/status。
6. 后端验证失败时保留 HTTP 状态和可纠正错误，不返回假成功。
7. Calendar、Task Detail、Plan Review、Focus 在写操作后重新读取相同后端资源。
8. Preview、Proposed、Confirmed 和 Active 不能共享模糊布尔字段。

## 10. Step 0 结论

当前系统已经具有正式流程所需的大部分后端资源和一批对应页面，不适合推倒重写。正确路线是以 `Profile + Task` 为聚合基础，逐步收紧 Plan Revision、Execution Session 和用户确认边界，再统一前端旅程。

下一步进入 `plan.md` 的 **Step 1：统一登录身份与 API 基础契约**。开始代码修改前，需要先确定当前 NextAuth session、Python `users` 表以及 Profile/Task/Plan 表实际采用的用户标识，并给出兼容已有生产数据的迁移方案。
