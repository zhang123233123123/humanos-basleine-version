# HumanOS 后端数据字段说明

> 版本：HumanOS SYY7  
> 目的：说明后端为了登录、智能排程、执行反馈和研究分析需要保存哪些字段，以及这些字段来自哪里。  
> 原则：只收集会影响功能或研究问题的数据；用户自报、AI 推断、系统记录和派生结果必须分开保存。

## 1. 数据来源分类

每个会影响计划的非确定性字段，建议同时保存 `source`、`evidence`、`confidence_level` 和 `user_confirmed`。

| 来源 | 含义 | 示例 |
| --- | --- | --- |
| `user_self_report` | 用户直接填写或确认 | Deadline、可用时间、当前精力 |
| `ai_inference` | DeepSeek 根据文本推断 | Task Demand、任务依赖、资源类型 |
| `system_observed` | 系统在交互或执行中记录 | 实际用时、中断时间、确认操作 |
| `derived` | 后端从已有数据计算 | 剩余时长、认知匹配分、候选计划指标 |
| `default` | 暂无证据时的临时默认值 | 首次进入时的默认状态；不得伪装成用户事实 |

推荐的推断元数据结构：

```json
{
  "source": "ai_inference",
  "evidence": ["The task requires sustained writing and synthesis."],
  "confidence_level": "medium",
  "user_confirmed": false
}
```

## 2. P0：生成有效周计划必须收集的字段

### 2.1 用户与登录

| 字段 | 类型 | 来源 | 必需 | 用途 |
| --- | --- | --- | --- | --- |
| `user_id` | string/UUID | 系统 | 是 | 隔离不同用户的数据 |
| `email` | string | 用户 | 是 | 登录与账号识别 |
| `name` | string | 用户 | 是 | 界面称呼 |
| `password_hash` | string | 系统 | 是 | 验证密码，只存哈希 |
| `salt` | string | 系统 | 是 | 密码哈希加盐 |
| `created_at` | timestamp | 系统 | 是 | 账号审计 |
| `last_login_at` | timestamp | 系统 | 否 | 登录状态与日常 check-in 判断 |

禁止保存明文密码。DeepSeek API Key 只放在服务器环境变量中，不写入数据库、不发送给前端。

### 2.2 长期 Profile（相对稳定）

| 字段 | 类型/示例 | 来源 | 必需 | 排程作用 |
| --- | --- | --- | --- | --- |
| `role` | `masters_student` | 用户 | 是 | 提供任务场景背景，不直接占用时间 |
| `learning_mode` | `reading_writing` | 用户 | 否 | 解释任务偏好 |
| `timezone` | `Europe/Amsterdam` | 用户/系统 | 是 | 正确解析日期、Deadline 和日历时间 |
| `deep_work_window` | `09:00-11:30` | 用户 | 是 | 高需求任务的软偏好 |
| `low_energy_window` | `14:00-15:30` | 用户 | 否 | 轻任务的软偏好 |
| `preferred_session_minutes` | `45` | 用户 | 是 | 长任务拆分时的目标 Session 长度 |
| `rest_between_tasks_minutes` | `15` | 用户 | 是 | Session 间休息和切换边界 |
| `day_rhythm.morning_energy` | 1–7 | 用户 | 否 | 候选时段评分 |
| `day_rhythm.afternoon_energy` | 1–7 | 用户 | 否 | 候选时段评分 |
| `day_rhythm.evening_energy` | 1–7 | 用户 | 否 | 候选时段评分 |
| `control_preference` | `ai_proposed_user_editable` | 用户/系统 | 是 | 强制 AI 提议、用户确认的控制模式 |
| `onboarding_completed` | boolean | 系统 | 是 | 避免每次重新填写 Profile |

`deep_work_window` 和每日精力是偏好，不是系统对用户每天状态的预测，也不是硬约束。

### 2.3 Weekly Context（每周变化）

| 字段 | 类型 | 来源 | 必需 | 排程作用 |
| --- | --- | --- | --- | --- |
| `week_of` | date | 系统 | 是 | 标识数据属于哪一周 |
| `weekly_goal` | string | 用户 | 否 | 解释优先级权衡，不直接创建任务 |
| `weekly_available_windows` | array/object | 用户 | 是 | AI 只能在这些时间内安排工作 |
| `context_items` | array | 用户/AI+确认 | 是 | 保存固定时间、习惯时段和灵活活动 |
| `keep_buffer` | boolean | 用户 | 是 | 是否主动保留未排满空间 |
| `buffer_preference` | string/object | 用户/系统 | 否 | Buffer 比例、位置或说明 |
| `confirmed_plan_summary` | object | 系统 | 否 | 确认后保留只读计划摘要和版本 |

#### 可用时间窗口

```json
{
  "id": "availability_01",
  "day": "Thursday",
  "start": "08:00",
  "end": "23:00",
  "timezone": "Europe/Amsterdam"
}
```

#### Context item 的统一结构

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `id` | string/UUID | 是 | 后续点击、编辑和聊天修改必须依赖稳定 ID |
| `type` | enum | 是 | `fixed_event`、`recurring_routine`、`flexible_activity` |
| `title` | string | 是 | 如 `Research meeting`、`Lunch`、`Gym` |
| `days` | array | 是 | 可发生或重复的日期 |
| `start` / `end` | time | 固定/习惯需要 | 固定事件不可移动；习惯时段允许小范围调整 |
| `duration_minutes` | integer | 灵活活动需要 | AI 安排活动所需时长 |
| `occurrence_mode` | enum | 是 | `once_this_week` 或 `repeat_each_selected_day` |
| `allowed_range` | object | 灵活活动建议 | 如 `17:00` 以后，避免被排入不合适时段 |
| `shift_minutes` | integer | 习惯时段建议 | 最多允许前后移动多少分钟 |
| `source` | enum | 是 | 用户填写、AI 推断或系统生成 |
| `confidence_level` | enum | AI 推断时需要 | `low`、`medium`、`high` |
| `user_confirmed` | boolean | AI 推断时需要 | 影响整周时必须确认 |

三种类型的语义：

- `fixed_event`：会议、课程、预约等，时间不可移动；后端只检查冲突并重排受影响的弹性任务。
- `recurring_routine`：午饭、通勤、休息等偏好边界，可在符合正常作息的范围内轻微移动。
- `flexible_activity`：健身、散步、购物等，由 HumanOS 在允许日期和范围内选择时间。

必须区分：

- `once_this_week`：本周任意一个合适日期执行一次。
- `repeat_each_selected_day`：每个选中日期都执行一次。

### 2.4 任务 Task

#### 用户至少需要提供

| 字段 | 类型/示例 | 必需 | 说明 |
| --- | --- | --- | --- |
| `title` | `Analyze interview transcripts` | 是 | 要完成的结果，不包含“周三前”等时间前缀 |
| `deadline_at` | ISO datetime + timezone | 是 | 最晚完成时间，不是开始时间 |
| `estimated_duration` | integer minutes | 是* | 总工作量；可由 AI 初估，但需要明确标记并允许修改 |
| `priority` | `low/medium/high` | 是 | 用户认为的业务优先级 |
| `expected_difficulty` | 1–7 或 light/moderate/demanding | 否 | 用户预期难度；缺失时 AI 可推断但不能静默当成事实 |
| `context` | string | 否 | 描述、交付要求、依赖材料 |

Deadline 必须保存为完整时间点。如果用户只给“Friday”，后端可临时使用当天最后一个可用窗口作为假设，但必须保存 `deadline_assumption` 并在确认区可编辑。

#### 后端任务对象

| 字段 | 来源 | 作用 |
| --- | --- | --- |
| `id`, `user_id` | 系统 | 任务身份与权限检查 |
| `type` | AI/规则 | 内容领域，如 `writing`、`reading`、`coding` |
| `task_type` | AI/规则 | 排程属性，如 `flexible_task`、`fixed_event`、`recovery_task` |
| `due` / `deadline` / `deadline_at` | 用户/解析器 | Deadline 原文、规范值与绝对时间 |
| `deadline_assumption` | 系统 | 只给日期时采用了什么临时假设 |
| `duration` | 用户/AI+确认 | 总时长 |
| `priority` | 用户 | 截止风险与排序 |
| `status` | 系统 | `queued`、`scheduled`、`partial`、`paused`、`completed` 等 |
| `task_demand` | AI/用户 | 认知需求假设、证据和置信度 |
| `resource_modality` | AI | `visual`、`auditory`、`manual`、`mobility` 等，用于并行兼容性 |
| `parallelizable` | AI/用户 | 是否允许系统提出并行建议，不等于允许任意重叠 |
| `ambiguity` | AI/系统 | 任务是否需要先澄清 |
| `switch_cost` | AI/系统 | 切换到其他任务的成本 |
| `reentry_cost` | AI/系统 | 中断后恢复上下文的成本 |
| `checkpoints` | 用户/系统 | 恢复提示和阶段检查点 |
| `execution` | 系统 | 总时长、已完成、剩余时长和 Session 记录 |
| `created_at`, `updated_at` | 系统 | 审计、去重和同步 |

`task_demand` 推荐结构：

```json
{
  "estimated_cognitive_load": "high",
  "expected_difficulty": 6,
  "task_features": {
    "uncertainty": "medium",
    "precision_requirement": "high",
    "external_dependency": false
  },
  "evidence": ["Requires synthesis of interview themes."],
  "confidence_level": "medium",
  "source": "ai_inference",
  "user_confirmed": false
}
```

### 2.5 计划 Session / Calendar Block

长任务应保存为多个 Session，而不是把任务拆成多个新 Task。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `block_id` | string | 时间块身份 |
| `task_id` | string | 所属原任务 |
| `date` / `day_index` | date/integer | 所在日期 |
| `start` / `end` | datetime | 15 分钟网格上的开始与结束 |
| `session_minutes` | integer | 本 Session 的日历占用时长 |
| `planned_work_minutes` | integer | 扣除 padding 后的实际计划工作时长 |
| `padding_minutes` | integer | 切换、恢复或边界时间 |
| `remaining_after_block_minutes` | integer | 此 Session 后任务剩余时长 |
| `session_index` / `session_count` | integer | 第几个 Session / 总 Session 数 |
| `status` | enum | `proposed`、`confirmed`、`completed` 等 |
| `constraint_evidence` | array | 为什么该时间可用、匹配了哪些约束 |
| `parallel_group_id` | string/null | 已确认并行组；普通任务为空 |

务必区分：

- `total duration`：完成整个 Task 的总工作量。
- `session duration`：单个日历块的时长。
- `remaining duration`：扣除已完成工作后的剩余量。

未完全安排的 Task 必须标记为 `partial`，不能标记为 `scheduled`。

### 2.6 当前状态 Momentary State

| 字段 | 类型 | 来源 | 说明 |
| --- | --- | --- | --- |
| `focus` | 1–7 | 用户自报 | 当前专注程度 |
| `energy` | 1–7 | 用户自报 | 当前精力 |
| `stress` | 1–7 | 用户自报 | 当前压力 |
| `mood` / `emotion` | enum/string | 用户自报 | 情绪状态 |
| `readiness` | enum | 用户自报 | 是否准备开始 |
| `attention_residue` | string | 用户可选 | 上一件事残留的注意内容 |
| `daily_note` | string | 用户可选 | 今天需要新增、修改或说明的情况 |
| `created_at` | timestamp | 系统 | 状态有效时间 |

这组信息只影响“今天接下来的第一个 Session”，不能用一次状态预测整周。

## 3. AI 排程与用户确认需要保存的字段

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `request_id` | 前端/系统 | 防止重复请求和重复聊天消息 |
| `prompt_version` | 系统 | 追踪使用了哪版 Prompt |
| `provider` / `model` | 系统 | 如 `DeepSeek/deepseek-chat` |
| `ai_task_analysis` | AI | Task Demand、依赖、资源类型和证据 |
| `candidate_plans` | AI/调度器 | 推荐方案及可展开的备选方案 |
| `selected_candidate_id` | 系统/用户 | 当前推荐或用户选择的候选 |
| `plan_patch` | AI | 提议的 Session 列表 |
| `validation` | Python | 冲突、Deadline、可用时间、Buffer 和并行合法性检查 |
| `unscheduled_tasks` | Python | 未能完全排入的任务及剩余分钟数 |
| `repair_suggestions` | AI/系统 | 增加可用时间、拆 Session、延长 Deadline 等修复建议 |
| `explanation` / `reasons` | AI/系统 | 面向用户的简洁解释 |
| `confidence` | AI/系统 | 置信度、证据和缺失信息 |
| `requires_confirmation` | 系统 | 计划进入正式日历前必须为 `true` |
| `confirmed_at` | 系统 | 用户确认时间 |
| `confirmed_plan_summary` | 系统 | 确认后保留的只读摘要，而不是清空 Review |

正确职责边界：

```text
DeepSeek 生成任务分析和候选时间块
→ Python 检查所有硬约束
→ 用户在右侧修改并确认
→ 后端保存正式 Session 和确认摘要
```

Python 不应替 AI 偷偷重新决定完全不同的时间；若验证失败，应把错误和修复选项返回给 AI/用户。

## 4. P1：执行、中断和个性化学习字段

### 4.1 中断 Context Dump

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `task_id` | 系统 | 关联同一个 Task |
| `progress` | 用户 | 已做到哪里 |
| `progress_percent` | 用户/系统 | 数值进度 |
| `remaining_duration_minutes` | 用户/系统 | 中断后剩余时长 |
| `open_questions` | 用户 | 尚未解决的问题 |
| `next_action` | 用户 | 恢复时第一个可执行动作 |
| `stop_reason` | 用户 | 暂停、阻塞、疲劳、外部打断等 |
| `materials` | 用户 | 文件、链接或材料引用；尽量只存引用而非全文 |
| `created_at` | 系统 | 中断时间 |

### 4.2 Execution Feedback

反馈需分别评价任务、用户状态和系统建议。

```json
{
  "task_id": "task_01",
  "trigger": "session_finished",
  "task_evaluation": {
    "completion": "partial",
    "actual_minutes": 40,
    "remaining_duration_minutes": 80,
    "perceived_difficulty": 5
  },
  "state_evaluation": {
    "focus_after": 4,
    "energy_after": 3,
    "stress_after": 5
  },
  "recommendation_evaluation": {
    "timing_fit": "good",
    "session_length_fit": "too_long"
  }
}
```

并行执行时额外保存：

- `parallel_group_id`
- `partner_task_ids`
- 两个任务各自的完成结果
- `interference_level`
- 用户是否愿意以后再次采用类似并行安排

### 4.3 State Transition

| 字段 | 说明 |
| --- | --- |
| `before_state` | 建议前的状态 |
| `action` | 系统建议或用户选择 |
| `predicted_state` | 系统预期结果 |
| `actual_state` | 执行后的实际状态 |
| `outcome` | 是否完成、是否改善、是否需要修正模型 |

该结构用于检验建议是否有效，而不是只记录“AI 推荐了什么”。

## 5. P2：对话、Memory 和审计字段

### 5.1 Chat Turn

当前保存：`user_text`、`assistant_reply`、`intent`、解析特征、关联 `task_ids` 和时间戳。

建议：

- 只在连续对话、任务修改或研究分析需要时保存原文。
- 为聊天设置明确保留期限。
- 修改“组会变成下午两点”时，应记录目标 context item ID 和 patch，而不是创建重复事项。

### 5.2 Memory / Learned Pattern

| 字段 | 说明 |
| --- | --- |
| `source_type` / `source_id` | 记忆来自 Profile、Task、Context Dump 或执行反馈 |
| `task_id` | 可选的任务关联 |
| `text` | 可检索摘要 |
| `metadata` | 证据类型、标签、置信度等 |
| `embedding` | 本地检索向量 |
| `created_at` | 生成时间 |

一次执行结果只能形成 Episodic Memory。只有多次相似结果或用户明确确认后，才能提升为 `learned_patterns` 并影响长期 Profile。

### 5.3 Event / Audit Log

建议保存：`event_id`、`user_id`、`event_type`、必要的结构化 payload、`request_id` 和时间戳。用途是去重、问题定位和研究追踪，不应复制整份敏感文本。

## 6. 当前数据库表与字段组映射

| 表 | 保存内容 |
| --- | --- |
| `users` | 登录身份、密码哈希和登录时间 |
| `profiles` | 长期 Profile、Weekly Context、偏好和 Learned Patterns |
| `tasks` | 任务、Task Demand、执行进度、资源类型和并行标记 |
| `runtime_states` | 每次当前状态自报 |
| `context_dumps` | 中断时的进度、问题、下一步和恢复材料 |
| `execution_feedback` | 任务、状态和系统建议的执行反馈 |
| `state_transitions` | 建议前后状态与实际结果 |
| `chat_turns` | 对话、意图、解析特征和关联任务 |
| `memories` | 可检索的情景记忆和证据 |
| `events` | 系统事件与审计记录 |

## 7. 不应收集或不应暴露的内容

- 明文密码、DeepSeek API Key、Cloudflare 凭据。
- 与排程和研究无关的健康、位置、联系人或私人文件全文。
- 未经确认就写入 Static Profile 的 AI 心理状态判断。
- 把低置信度推断包装成确定事实。
- 在用户界面直接展示内部 ISO 时间、数据库 ID、原始 JSON 或 Prompt 技术字段。
- 无限期保留完整聊天与材料内容。

## 8. 最小可运行数据集

如果只做一次完整演示，后端至少需要：

1. `user_id`、`email`、密码哈希和 `timezone`；
2. 长期节奏：深度工作窗口、Session 长度和休息时长；
3. 本周可用时间、固定事件、习惯时段、灵活活动和 Buffer 选择；
4. 每个任务的标题、完整 Deadline、总时长和 Priority；
5. 今天的 focus、energy、stress 和 mood；
6. DeepSeek 的任务分析、候选时间块、证据和置信度；
7. Python 验证结果、未排部分和修复建议；
8. 用户确认后的 Session 与计划摘要；
9. 中断后的 progress、remaining duration、next action；
10. Session 结束后的实际用时、完成度和体验反馈。

这套字段足以支持 HumanOS 当前完整链路：Profile → Weekly Context → Tasks → AI 候选计划 → Python 验证 → 用户确认 → 日历执行 → 中断恢复 → Execution Feedback → 个性化学习。
