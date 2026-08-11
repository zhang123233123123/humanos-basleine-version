# HumanOS UX 正式流程实施计划

## 1. 目标与依据

本计划以 `HumanOS_UX_End_to_End_Flow_CN.docx` 为产品流程基准，以根目录 `AGENTS.md` 为工程约束，将当前 HumanOS 从功能集合逐步整理为完整闭环：

```text
Profile 建模
-> Weekly Context 与 Tasks
-> Draft Plan
-> Python 硬约束验证
-> Calendar 审查与整份确认
-> Execution Session
-> Focus 执行
-> Pause / Resume / Finish
-> Feedback / Memory / Pattern
-> Daily Check-in / Week Rollover
```

生产代码只使用：

- 前端：`frontend/`
- 后端：`backend/`
- 本地前端端口：`3000`
- 本地后端端口：`8787`
- 前端通过同源 `/api/*` 访问后端，不在浏览器中直连后端端口。

`calendar-ai/` 只作为历史参考，不参与生产修改。

## 2. 实施原则

1. `Profile` 和 `Task` 是业务聚合根；Plan、Session、Feedback、Memory、Pattern 是围绕它们产生的生命周期资源。
2. 后端是状态和业务计算的唯一事实来源，前端不得自行重排后续任务或伪造成功状态。
3. AI 负责理解语义和提出具体方案；Python 负责确定性硬约束验证。
4. Candidate、Preview、Proposed、Confirmed、Active、Completed 等状态必须明确区分。
5. 所有计划修改必须形成新的 `plan_revision`，并同步 Calendar 与 Execution Session。
6. 用户始终拥有最终确认权。软风险可以 `Keep Anyway`，硬约束不能绕过。
7. 每一步只完成一个可验收的垂直流程，完成后单独 Git 提交。
8. 每一步开始前先检查现状和接口映射；涉及重要产品或 API 决策时先确认再实现。
9. 每一步完成后先本地验收；用户确认后再部署生产服务器。
10. 不提交密钥、数据库、构建目录或环境文件。

## 3. 统一状态模型

### 3.1 Task 生命周期

```text
preview -> queued -> scheduled -> running -> paused -> completed
                                  |          |
                                  -> blocked -> terminated
```

### 3.2 Plan 生命周期

```text
proposed -> confirmed -> needs_update -> superseded
```

任何确认后修改都必须创建新 revision；旧 revision 保留为历史，不能在原计划上静默覆盖。

### 3.3 Execution Session 生命周期

```text
planned -> ready -> active -> paused -> completed
                             |         |
                             -> ended  -> cancelled
```

Task 状态与 Session 状态相关但不等价。一个 Task 可以对应多个 Session。

### 3.4 Pattern 生命周期

```text
observation -> candidate -> confirmed -> dismissed/forgotten
```

单次行为只进入 Episodic Memory；只有重复证据或用户确认才能提升为 Learned Pattern。

## 4. 分阶段实施

## Step 0：建立流程基线与差异清单（已完成）

### 目标

冻结当前系统的真实行为，建立 UX 文档、页面、接口和持久化数据之间的映射，避免后续边改边猜。

### 工作内容

- 列出正式页面：Workspace、Weekly Plan、Tasks、Focus、Insights、Settings、QA。
- 为每个用户动作映射前端组件、Next.js Proxy、后端端点和持久化对象。
- 标记缺失、重复、仅前端实现、身份不一致和状态不一致的位置。
- 定义统一错误结构、日期格式、时区规则和 ID 规则。
- 记录当前生产部署版本与数据库迁移风险。

### 验收

- 每个正式流程动作都有明确 API 所有者。
- Calendar、Plan、Task、Session 的数据来源无歧义。
- 形成可逐项勾选的差异清单。

### Git 提交

```text
docs(architecture): map formal UX flow to current implementation
```

## Step 1：统一登录身份与 API 基础契约（已完成）

### 目标

解决登录账号、NextAuth 用户、后端用户和业务数据使用不同标识的问题。

### 工作内容

- 定义唯一稳定的 `user_id`，邮箱只作为登录标识而不是业务外键。
- 统一所有 Next.js Proxy 的用户解析方式。
- 统一后端认证失败、权限不足、验证失败和服务异常响应。
- 增加共享 API Client、错误类型和 snake_case/camelCase 边界转换。
- 保证五个 QA 账号使用相同的身份规则并保留测试时钟权限。

### 验收

- 同一账号在 Profile、Task、Plan、Session 和 Pattern 中使用同一个 `user_id`。
- 重新登录后仍能读取相同业务数据。
- 普通账号不能访问 QA 权限；QA 账号可以访问测试能力。

### Git 提交

```text
fix(auth): unify frontend and backend user identity
```

## Step 2：完成首次 Profile 四步建模（已完成）

### 目标

首次用户必须建立足够的长期 Profile 和当前 Weekly Context，完成后直接进入 Draft Plan。

### 页面流程

1. Study Context 与 Planning Background。
2. Working Rhythm。
3. Available Time、Fixed Time、Routine、Flexible Activity、Buffer。
4. Weekly Goal、Tasks、Focus、Energy、Stress、Mood。

### 后端与数据

- Static Profile 与 Research Background 分开保存。
- Weekly Context 必须绑定 `week_id`。
- Wizard Task 从创建时携带稳定 `task_id`。
- Momentary State 只影响今天下一个未开始 Session。
- 单次状态和行为不得直接覆盖长期 Working Rhythm。

### 验收

- 新账号不会绕过必要设置直接得到缺少上下文的计划。
- 中途退出后可以恢复向导进度。
- 完成后显示 `Building your first plan...`，随后进入包含 Proposed Plan 的 Calendar。

### Git 提交

```text
feat(onboarding): implement profile and weekly setup wizard
```

## Step 3：统一 Task 输入、AI 解析与事实确认（已完成）

### 目标

让批量自然语言任务稳定解析为任务事实，避免把“确认任务信息”和“确认计划时间”混为一谈。

### 工作内容

- AI 输出严格结构化字段：title、duration、priority、deadline、deadline_time、difficulty、dependency。
- 编号列表和批量输入逐项保持独立字段，禁止复制首项时长或截止日期。
- 缺失字段明确标记，不静默编造开始时间、截止日期或时长。
- 右侧显示 Task Preview，可编辑、取消、批量“保存任务信息”。
- 保存后 Task 进入 Ready/Queued，但尚未作为 Confirmed Calendar Session。
- 普通账号与 QA 账号均可解析任务；QA 额外拥有调试信息和测试时钟。

### 验收

- 八项批量任务可以正确解析八组独立时长、优先级和截止日期。
- 单项确认与批量保存都不会重复创建 Task。
- 页面明确提示“任务已保存，尚未安排时间”。

### Git 提交

```text
fix(tasks): stabilize structured parsing and task confirmation
```

## Step 4：建立 Weekly Setup 与可靠的 Draft Plan（已完成）

### 目标

根据本周环境和全部 Ready Tasks 生成可解释、可验证、不会重叠的具体 Draft Slots。

### 工作内容

- 收集绝对日期、当前时间、Available Windows、Fixed Events、Routine、Buffer 和依赖关系。
- DeepSeek/PydanticAI 负责生成 day/start/end 和用户可读理由。
- Python 检查 Available Window、Fixed Event、Deadline、Dependency、15 分钟网格和重叠。
- 验证失败将 violations 返回 AI，最多重试 2 至 3 次。
- 长任务按 Preferred Focus Session 拆分，并插入 Break 和 Buffer。
- 支持经用户确认的 Parallel Pair，且同一时间最多两个兼容活动。
- 无法排下的工作进入明确的 `unscheduled_tasks`，禁止静默丢失剩余时长。
- 空计划且存在可执行任务时必须拒绝确认。

### 验收

- 每分钟工作量都被排入 Session 或明确解释为 unscheduled。
- 不存在未经确认的任务重叠。
- Draft Slot 带有 `week_id`、绝对 start/end 和 `plan_revision`。
- Proposed Plan 不会被前端误显示为 Active Plan。

### Git 提交

```text
feat(planning): generate and validate weekly draft plans
```

## Step 5：重构 Calendar Workspace 与整份计划确认（已完成）

### 目标

让 Workspace 符合正式三栏流程，并以 Calendar 作为日常工作台。

### 页面布局

- 左侧：AI Chat，只处理任务变化、阻塞、疲劳、解释和复杂调整。
- 中央：Calendar，显示 Draft、Confirmed、Fixed、Routine、Buffer 和当前时间。
- 右侧：Plan Review / Task List，显示 Deadline、Planned Sessions、Edit 和 Cancel。
- 顶部：Workspace、Weekly Plan、Tasks、Focus、Insights、Settings。
- 移除重复导航和遮挡核心操作的悬浮 Dock。

### 交互规则

- Proposed Session 使用虚线；Confirmed Session 使用实线。
- 拖动和缩放只产生 Draft Edit，不直接修改活动计划。
- 硬约束失败必须修改；软风险提供 `Modify Plan` 与 `Keep Anyway`。
- 整份计划使用唯一按钮 `Confirm plan` 或 `Add plan to calendar`。
- 确认成功后创建/更新 Execution Sessions，并同步 Calendar。

### 验收

- 右侧确认按钮在目标桌面分辨率下始终可见且不被遮挡。
- Calendar、Plan Review 和后端 active revision 一致。
- 刷新页面后显示后端确认状态，不依赖组件本地状态。

### Git 提交

```text
feat(workspace): align calendar review and plan confirmation flow
```

## Step 6：计划修改、Revision 与 Session 同步（已完成）

### 目标

解决确认计划修改后 Calendar 与执行小面板仍展示旧 Session，以及前端自行顺延任务的问题。

### 工作内容

- 所有确认后修改先生成 Calendar Diff 和 Proposed Revision。
- 后端统一重新计算受影响范围，Python 重新验证。
- 用户 Apply 后创建新 `plan_revision`，旧 revision 标记 superseded。
- 新 revision 原子更新对应 Execution Sessions。
- 已完成 Session 保持历史；未开始 Session 可替换；Active/Paused Session 按规则保留或迁移。
- 更新完成后前端重新读取 Active Plan、Calendar Events 和 Current Session。
- 提供短暂 Undo，但 Undo 同样必须经过后端持久化。

### 验收

- 修改计划后 Calendar、任务详情、Focus 和执行小面板显示同一 revision。
- 后端拒绝修改时前端回滚，不展示假成功。
- 前端 JavaScript 不再自行整体顺延后续任务。

### Git 提交

```text
fix(planning): synchronize plan revisions and execution sessions
```

## Step 7：统一 Focus 与 Active Session 执行（已完成）

### 目标

让 Calendar、Focus 和页面内桌宠共享唯一 Active Session 和后端时间。

### 工作内容

- Session 到点进入 Focus Ready；用户点击 Start 后写入真实 `actual_start_at`。
- 允许用户提前进入并立即开始，实际时间以点击 Start 为准。
- Focus 显示任务、本次目标、倒计时、已用时间、Remaining Work 和后续 2 至 3 个 Session。
- Start、Break、Pause、Switch、Finish 全部调用后端状态转换。
- 返回 Workspace 后计时继续，桌宠显示 Focusing、On Break 或 Paused。
- 计时基于后端 timestamp，不以组件 local timer 作为事实来源。
- Task 状态根据 Session 状态动态更新，但不把二者混为同一字段。

### 验收

- 刷新或跨页面后计时不会重置。
- 同一用户不能产生两个冲突的 Active Session。
- 提前开始、正常到点开始和测试时钟场景均有明确行为。

### Git 提交

```text
feat(focus): unify active session execution and timing
```

## Step 8：完成 Pause、Context Dump、Resume 与局部重排（已完成）

### 目标

暂停不再只是切换状态，而是保留恢复上下文并判断对后续计划的真实影响。

### 工作内容

- Break 与 Pause 分开：正常 Break 不询问原因。
- Pause 收集 Reason、Progress、Next Step、expected_resume_time 和 remaining work。
- Resume 使用真实当前时间检查与后续 Session 的冲突。
- 无冲突时显示 Resume Brief 并恢复原 Session。
- 有冲突时提供 Continue Now and Adjust、Shorter Session、Choose Another Time、Keep Current Plan。
- 需要调整时由后端生成局部 Proposed Revision 和 Calendar Diff。
- Switch 从 Ready Queue 推荐合适任务，并保留原 Task 的 Context Dump。

### 验收

- 暂停后可以准确看到原任务从哪里继续。
- Resume 不会直接覆盖后续任务时间。
- 所有受影响变更经过后端计算、Python 验证和用户确认。

### Git 提交

```text
feat(execution): implement contextual pause resume and replanning
```

## Step 9：完成 Finish、Feedback 与 Remaining Work（已完成）

### 目标

任务结束后正确记录实际执行、剩余工作和建议反馈，并决定是否需要局部重排。

### 工作内容

- Finish 提供 Completed、Some Progress、No Progress、Did Not Start。
- 保存 `actual_end_at`、实际时长、结果、Progress、Next Step 和 Remaining Work。
- 提前完成时让用户选择 Keep the Time Free 或 Review Today’s Plan。
- 部分完成影响后续计划时生成 Calendar Diff，不擅自填充空闲时间。
- 任务反馈、当前状态反馈和推荐评价分开保存。
- 完成反馈后返回 Calendar 或下一个 Focus，不强制打开 Task Details。

### 验收

- Task 完成度与多个 Session 的实际记录一致。
- Remaining Work 不会因结束 Session 而消失。
- 只有系统真正提出建议时才询问建议是否有帮助。

### Git 提交

```text
feat(feedback): persist execution outcomes and remaining work
```

## Step 10：实现 Daily Check-in 与 Week Rollover（已完成）

### 目标

把每日状态变化和新周迁移纳入主流程，而不是隐藏功能。

### 工作内容

- 每日本地日期首次进入显示 Daily Check-in。
- 收集 Focus、Energy、Stress、Mood 和可选文本。
- 只评估今天第一个未开始 Session；无须调整时明确提示。
- `last_daily_checkin_date` 防止一天重复弹出。
- 新周提供 Use Last Week as a Starting Point 和 Start Fresh。
- 重新确认 Available Time、Fixed Events、Weekly Goal、Momentary State 和未完成 Tasks。
- 保留 Static Profile、Confirmed Patterns、原 task_id、Context Dump 和执行历史。
- 归档上一周 Weekly Context 和 Confirmed Plan 为只读历史。

### 验收

- Daily Check-in 不会随意重写整周计划。
- Week Rollover 不复制一次性事件，不丢失未完成任务历史。
- 新周生成新的 `week_id` 和 Proposed Plan。

### Git 提交

```text
feat(weekly): implement daily check-in and week rollover
```

## Step 11：实现 Insights、Memory 与 Pattern 提升（已完成）

### 目标

让普通用户透明地查看系统学到了什么，同时严格控制长期学习边界。

### 页面内容

- Recent Observations：近期事实。
- Possible Patterns：重复 3 至 5 次形成的候选。
- Confirmed Patterns：用户确认后可用于后续计划的软证据。
- Technical Details：Prompt、评分和 Decision Trace，默认隐藏或只在 QA/开发者模式显示。

### 工作内容

- Memory 统一为 Profile 学习证据，不直接修改计划。
- Pattern 必须经过 candidate、confirm/promote 才能生效。
- 支持 Confirm、Edit、Dismiss、Forget。
- 删除或撤销 Pattern 后，后续 Prompt 不再使用。
- 将普通 Insights 与独立 QA/开发者字段页面分离。

### 验收

- 单次拖动或暂停不会形成稳定人格判断。
- 用户能看到证据、适用范围和更新时间。
- 未确认 Pattern 不会覆盖 Static Profile。

### Git 提交

```text
feat(insights): expose user-controlled memory and patterns
```

## Step 12：统一导航、设置、中英文与响应式体验

### 目标

统一所有正式页面的导航、视觉层级、语言和状态表达。

### 工作内容

- 统一 Workspace、Plan、Tasks、Focus、Insights、Settings 的顶部导航。
- 重新整理 Settings：Profile、Working Rhythm、Scheduling、Notifications、Privacy。
- 所有正式页面支持中文和英文，不只 Calendar 支持切换。
- 统一加载、空状态、验证错误、权限错误、后端不可用和成功反馈。
- 确保月、周、日三种 Calendar 视图正常显示。
- 核心操作在 1366x768、1440x900 和当前桌面尺寸下无需缩放。
- QA 控件只对测试账号显示。

### 验收

- 切换语言后所有导航、助手、设置、任务、Focus 和 Insights 同步变化。
- 月视图无重叠乱码，周/日视图不回归。
- 所有正式页面视觉语言一致且不存在操作按钮遮挡。

### Git 提交

```text
feat(ui): unify navigation localization and responsive layouts
```

## Step 13：完整业务回归、迁移与生产发布

### 目标

验证整个正式流程在本地和生产环境中使用同一套持久化状态和接口契约。

### 回归场景

1. 注册、登录和五个 QA 账号权限。
2. 首次 Profile 与 Weekly Setup。
3. AI 单项和批量任务解析。
4. 保存任务事实、生成计划、Python 验证、整份确认。
5. Calendar、Task Details 和 Execution Sessions 同步。
6. 拖动、编辑、删除和 Plan Revision。
7. 提前 Start、到点 Start、Break、Pause、Switch、Resume、Finish。
8. Feedback、Context Dump、Re-entry 和 Remaining Work。
9. Daily Check-in 与局部重排。
10. Week Rollover。
11. Memory、Pattern Candidate、Confirm、Dismiss 和 Forget。
12. 中英文、月/周/日视图和目标分辨率。

### 发布步骤

- 先备份生产数据库。
- 执行必要的数据迁移和身份修复。
- 部署本地 `frontend/src/` 到服务器 `/root/humanos-app/src/`。
- 部署本地 `backend/` 到服务器 `/root/humanos-app/backend/`。
- 构建并只重启受影响的 PM2 canonical process。
- 检查 HTTPS、登录、健康接口和一条完整 QA 场景。
- 记录发布 commit 和回滚点。

### 验收

- 完整主链路通过，没有前端自算状态。
- 刷新、重新登录和跨页面后状态保持一致。
- 生产版本与已验收 Git commit 一致。

### Git 提交

```text
test(regression): verify formal end-to-end UX lifecycle
```

## 5. 每一步的固定执行模板

每次只推进一个 Step，并遵循以下顺序：

1. 阅读该 Step 涉及的现有文件和接口。
2. 输出当前实现、目标行为、差异、涉及文件和风险。
3. 与用户确认本 Step 的修改范围。
4. 一次性完成该 Step 的代码修改。
5. 按本 Step 验收条件执行针对性检查。
6. 汇报修改内容、已知限制和验证结果。
7. 用户确认后执行 `git add` 和独立 `git commit`。
8. 需要生产验证时再部署该提交，不混入下一 Step。

## 6. 完成标准

HumanOS 正式流程完成必须同时满足：

- Profile 提供长期基础，单次行为不会直接覆盖长期偏好。
- Weekly Context 隔离每周可调度环境。
- Task 是工作事实的唯一来源，AI 不静默编造缺失字段。
- Proposed Plan 与 Confirmed Plan 明确区分。
- Python 拒绝硬约束违规，AI 只处理语义和软风险。
- Calendar、Plan、Task 和 Execution Session 使用相同后端状态。
- Pause、Resume 和计划修改通过 Revision 和 Calendar Diff 完成。
- Focus 使用后端真实时间和唯一 Active Session。
- Feedback 正确更新 Remaining Work。
- Memory 只提供证据，Pattern 经确认后才能作为软调度依据。
- Daily Check-in 和 Week Rollover 不破坏已确认历史。
- 普通页面与 QA/开发者页面权限和用途明确分离。
- 中英文、月/周/日视图和目标桌面尺寸均可正常使用。

## 7. 下一步

从 **Step 0：建立流程基线与差异清单** 开始。Step 0 只做现状映射和差异确认，不立即重构业务代码；确认差异清单后再进入身份与 API 契约修复。
