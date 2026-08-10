# HumanOS 后端核心模型

## 1. 架构结论

HumanOS 后端只有两个核心业务元素：

```text
Profile
Task
```

它们是系统中仅有的两个聚合根。Plan、Timeline、Session、Memory 和 Feedback 都必须能够明确归属于这两个聚合或二者之间的协调过程。

## 2. Profile 聚合

Profile 回答：**这个人通常如何工作，以及他在当前环境中处于什么状态？**

```text
Profile
├── Identity and Account Capabilities
├── Static Profile
│   ├── working rhythm
│   ├── preferred focus duration
│   ├── preferred break duration
│   └── long-term preferences
├── Weekly Context
│   ├── available windows
│   ├── fixed events
│   ├── routines
│   ├── flexible activities
│   ├── buffer preference
│   └── weekly goal
├── Momentary State
│   ├── focus
│   ├── energy
│   ├── stress
│   └── mood
└── Learned Patterns
    ├── candidate patterns
    └── user-confirmed patterns
```

### Profile 不负责

- 不保存完整 Task 副本。
- 不保存某个任务的实际执行计时。
- 不因一次拖动、暂停或低能量报告直接改变长期节奏。
- 不直接决定任务的正式时间位置。

## 3. Task 聚合

Task 回答：**用户需要完成什么，以及这项工作目前进行到了哪里？**

```text
Task
├── Definition
│   ├── task_id
│   ├── title
│   ├── schedule_type
│   ├── domain_type
│   ├── deadline
│   ├── duration
│   ├── priority
│   └── dependencies
├── Planning State
│   ├── active slot reference
│   ├── scheduled work
│   └── unallocated work
├── Execution
│   ├── execution sessions
│   ├── actual time
│   ├── remaining work
│   └── completion state
├── Interruption Context
│   ├── pause reason
│   ├── progress
│   ├── next step
│   └── expected resume time
└── Feedback
    ├── execution outcome
    ├── user state report
    └── recommendation rating
```

### Task 不负责

- 不复制用户的完整工作节奏或 Weekly Context。
- 不自行计算正式 Session 时间。
- 不把每一次 Session 当成新的 Task。
- 不因重新排程改变原始 `task_id`。

## 4. 协调对象

### 4.1 Plan Revision

Plan Revision 是以下纯函数式关系的版本化结果：

```text
Scheduler(Profile Snapshot, Tasks[]) -> Plan Revision
```

它记录：

- `plan_id`
- `week_id`
- `plan_revision`
- `profile_snapshot_revision`
- 参与排程的 `task_id`
- Proposed/Confirmed/Needs Update/Superseded 状态
- Python validation 结果
- 用户确认和 override 证据

Plan Revision 不拥有 Profile 或 Task。删除或 supersede 一个 Plan 不能删除 Task。

### 4.2 Weekly Timeline

Weekly Timeline 是 Plan Revision 的标准时间表达：

```text
WeeklyTimeline
├── week_id
├── timezone
├── plan_revision
└── intervals[]
    ├── interval_id
    ├── task_id / profile context source_id
    ├── kind
    ├── start_at
    ├── end_at
    ├── status
    ├── movable
    └── parallelizable
```

Calendar、Focus、Up Next 和桌宠必须读取同一 Active Plan Revision 对应的 Timeline/Execution Session。

## 5. 过程记录与证据

| 对象 | 所属范围 | 生命周期 |
|---|---|---|
| Execution Session | Task | 一次任务执行，从 ready 到 ended/superseded |
| Context Dump | Task | 一次 Pause/Interruption 的恢复信息 |
| Execution Feedback | Task | 一次 Finish 的结果记录 |
| Episodic Memory | Profile + Task Evidence | 一次真实行为证据，不直接改变长期 Profile |
| Learned Pattern | Profile | 多次证据或用户确认后的长期规律 |

这些对象可以拥有独立数据库表，但数据库表独立不等于领域层级平级。

## 6. 写入边界

### 修改 Profile

允许修改：长期偏好、Weekly Context、Momentary State、用户确认的 Learned Pattern。

不得直接修改：Task Definition、Task Remaining Work、Execution Session。

### 修改 Task

允许修改：Deadline、Duration、Priority、Dependency、Progress、Remaining Work。

如果修改影响已确认计划，必须把 Active Plan 标为 `needs_update`，不得由前端直接移动正式 Session。

### 修改 Plan

允许修改：Draft 时间块、候选方案、解释和 override。

确认后必须创建或激活明确的 revision，并由后端同步 Task Slot 和 Execution Session。

## 7. 关键不变量

1. 每个 Task 只有一个稳定 `task_id`。
2. Pause、Resume、Switch、Replan 和 Week Rollover 不改变 `task_id`。
3. 一个用户在一个 week_id 下最多只有一个 Active Confirmed Plan Revision。
4. 一个 active ready/paused Execution Session 必须属于 Active Plan Revision。
5. Running Session 可以作为真实执行事实跨 revision 保留，但必须明确处理其对新计划的影响。
6. Task 的 scheduled work 加 unallocated work必须解释全部 remaining work。
7. Profile 的长期规律只能来自重复证据或用户明确确认。
8. 前端操作不能直接成为正式排程事实；必须经过后端 revision 和 Python validation。

## 8. 推荐模块边界

```text
backend/app/
├── domain/
│   ├── profile/
│   ├── task/
│   ├── timeline/
│   └── policies/
├── application/
│   ├── profile/
│   ├── task/
│   ├── planning/
│   └── execution/
├── infrastructure/
│   ├── persistence/
│   ├── ai/
│   └── clock/
└── interfaces/
    └── http/
```

其中 `planning` 是 Profile 与 Task 的应用协调服务，不建立第三个平级领域聚合。

## 9. 后续工程约束

- 新功能设计必须先回答它属于 Profile、Task、Coordination 还是 Evidence。
- 无法明确归属的新对象不得直接增加数据库表或 API。
- API 契约必须显式携带 `week_id`、`plan_revision` 或稳定 `task_id`。
- Developer Snapshot 必须能够检查跨聚合引用是否一致。
- 后续状态机和 API 文档以本文件为架构基线。
