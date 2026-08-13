# HumanOS 完整 UX 流程与计算机调度原理对应说明

最后更新：2026-08-13
适用版本：`humanos-v4-zhj`

## 1. 总体设计原则

HumanOS 将每周计划视为一份需要用户最终确认的日程，而不是由系统直接覆盖用户日历的自动安排。DeepSeek 负责提出需要语义理解的判断与候选时间；Python 负责检查确定性的硬约束；任何会改变正式日历的 Plan Revision（计划修订）都必须在用户确认后才能生效。

整个执行流程与操作系统中的任务调度有以下对应关系：

- **Task（任务）**：持续存在的工作对象，类似进程或作业；
- **Session（执行时段）**：任务的一段具体执行时间，类似 CPU 时间片；
- **Ready Queue（就绪队列）**：当前已经具备执行条件、可以开始的任务；
- **Running、Paused、Ended、Completed**：分别表示运行中、已暂停、时段已结束和任务已完成；
- **Interrupt（中断）**：先保存当前执行状态，再决定接下来做什么；
- **Plan Revision（计划修订）**：一份待确认的调整草案，用户应用前不会替换当前正式计划。

## 2. 每周规划 UX

### 2.1 用户操作流程

1. 用户填写相对稳定的工作节奏，以及本周 HumanOS 可以安排任务的时间。
2. 用户填写不能移动的时间、通常在某个时间附近发生的活动、可由 HumanOS 安排的灵活活动，以及本周任务、Deadline、总时长、优先级和任务需求。
3. DeepSeek 分析任务语义、依赖关系、资源需求、认知需求，以及可能存在的低冲突并行任务组合。
4. DeepSeek 生成包含具体 Session 时间的候选计划。Python 检查可用时间、受保护时间、Deadline、依赖、重叠、15 分钟时间网格、剩余工作量和已经确认的并行组合。
5. 如果候选计划不合法，Python 把具体违规原因返回给 DeepSeek，让其重新生成或修复。中间失败过程不向普通用户展示。
6. HumanOS 最终只向用户展示一份推荐的 Draft Plan（计划草案）。其他候选计划只作为可选的详细信息，不要求普通用户比较三份方案。
7. 用户可以直接在草案日历上拖动或编辑任务，最后只需点击一次 **Add plan to calendar**。
8. 只有在用户完成这次确认以后，系统才创建正式的 Plan Revision 和对应的 Execution Sessions。

### 2.2 与计算机调度的对应

- 本周任务集合对应等待调度的作业集合；
- 用户可用时间对应处理器容量；
- Fixed Event 对应不可抢占的保留时间；
- Routine Window 对应可以在有限范围内移动的软约束；
- Flexible Activity 对应可以参与调度的低需求活动；
- Deadline 和任务依赖属于可行性硬约束；
- Task Demand、用户工作节奏、当前状态、任务切换成本和 Buffer 属于候选时间的排序标准。

## 3. 每日 Check-in

每日 Check-in 收集用户当下的 Focus、Energy、Stress 和 Mood。Momentary State 只用于调整今天接下来的第一个 Session 及其长度，不能把用户此刻的状态错误地推断到整个星期。

- Focus 较高且 Energy 足够时，优先选择重要、费力且已经 Ready 的任务；
- Focus 或 Energy 较低，或者 Stress 较高时，优先考虑较轻的任务或更短的 Checkpoint；
- Fixed Event、Deadline 或不可用时间可以覆盖这种偏好，但系统必须保留具体原因。

这对应运行时的动态优先级调整：每周计划是基础排程，真正派发下一个任务时可以根据实时状态重新排序 Ready Queue。

## 4. 开始和执行 Session

用户点击 **Start** 后，HumanOS 将 Execution Session 从 `ready` 改为 `running`，并在后端保存 `actual_start_at` 和 `resumed_at`。页面上的计时器根据后端时间戳计算，因此用户切换浏览器标签页、打开其他网站或暂时关闭页面时，已经记录的专注时间不会清零。

这对应调度器把一个 Ready 作业派发到处理器上运行。浏览器页面不是执行状态的唯一数据源，后端持久化状态才是真实来源。

## 5. Pause 对应一次 Interrupt

用户点击 **Pause** 后，系统立即停止当前活动计时并保存：

- `task_id` 和 `execution_session_id`；
- 已累计的实际执行分钟数；
- 当前 Session 和整个 Task 的剩余工作量；
- 当前 Plan Revision；
- 中断原因；
- 必要时保存当前进度和回来后的第一步。

这对应一次 Interrupt 加 Context Save。任务从 `running` 进入 `paused`。只保存中断信息不会立刻改写正式日历，系统需要先知道用户打算怎么处理当前任务。

### 5.1 Take a short break：Timed Waiting（定时等待）

当前任务进入 5、10、15 分钟或用户自定义时长的等待状态。由于用户仍准备继续同一个任务，系统不要求填写完整的 Context Dump。

- 如果当前 Session 余量、Buffer 或空闲时间可以吸收这次休息，正式计划保持不变；
- 如果回来后继续任务会影响后面的 Flexible Session，HumanOS 在休息结束后说明具体影响；
- Fixed Event 永远不能被向后推动。

这对应一个进程进入有限时长的等待状态，等待结束后重新回到 Ready Queue。

### 5.2 Continue this task later：Suspension（挂起）

用户填写“做到哪里了”和“回来后先做什么”，随后选择希望恢复的时间，或者让 HumanOS 推荐时间。

系统保留同一个 Task ID、已经完成的进度、剩余工作量和 Interruption History，然后检查可用时间、Fixed Event、Deadline、Dependency 和后续 Session。如果确实需要调整，系统只生成受影响部分的 Calendar Diff（局部日历差异）。用户点击 **Apply changes** 前，正式日历保持不变。

这对应保存进程上下文以后将任务挂起，并在未来重新准入 Ready Queue。

### 5.3 Switch to another task：Preemption 与 Context Switch（抢占和任务切换）

HumanOS 先保存当前任务的执行上下文，再从 Ready Queue 选择另一个任务。

- 如果用户自己选择下一项任务，系统只检查该任务是否 Ready、依赖是否满足，以及当前剩余时间是否适合开始；
- 如果用户让 HumanOS 推荐，当前 Focus、Energy 和 Stress 会参与 Ready Queue 排序。

新任务可以直接进入 Focus 页面。系统只重新检查受到这次切换影响的未来 Slot；如果需要修改正式日历，仍然先生成局部 Calendar Diff 并等待用户确认。

这对应当前任务被抢占、保存上下文，然后切换到另一项作业执行。

### 5.4 Help me decide：Scheduler Decision（调度器决策）

HumanOS 比较短暂休息、晚些时候继续、缩短当前 Session 和切换任务等方案。DeepSeek 负责理解中断原因和任务语义；Python 负责检查建议是否符合日历容量和 Deadline 硬约束。

如果剩余容量不足以保证 Deadline，系统只要求用户在以下选项中作出决定：

- 增加可用时间；
- 保持当前约束并接受无法按时完成的风险。

HumanOS 不会静默移动用户的 Deadline。

这对应调度器根据 Ready Queue、实时状态、剩余工作量和不可抢占时间作出策略选择。

## 6. Finish 的处理逻辑

### 6.1 提前或准时 Finish：Normal Termination（正常终止）

用户点击 **Finish session** 后，系统结束计时，只打开一次结果反馈，不再询问用户要不要换时间，也不会自动用其他任务填满提前释放的时间。

用户只需要记录本次结果：

- 完成整个任务；
- 取得了一些进展；
- 工作过，但没有取得进展；
- 没有开始——只有 `active_minutes = 0` 时才显示。

保存反馈后，系统更新 Task 进度，但原日历保持不变：

- 如果整个 Task 已完成，将任务标记为 `completed`；
- 如果只是部分完成，将剩余工作量放回 Ready Queue；
- 不要求用户选择新的日历时间；
- 不自动生成 Plan Revision。

这对应进程正常终止和执行结果结算。提前完成释放出的容量保持为空，除非用户之后主动要求重新规划。

### 6.2 轻微延迟：允许的执行波动

如果实际 Finish 时间比计划结束时间晚，但不足 15 分钟，系统记录：

```text
timing_outcome = late_within_tolerance
```

这类情况可能来自点击延迟或很小的执行误差，不视为调度失败，也不自动创建 Plan Revision。

### 6.3 严重超时 Finish：Overrun Failure 与局部重排

如果实际 Finish 时间比 `planned_end_at` 晚至少 15 分钟，系统记录：

- `timing_outcome = overrun_failure`；
- 实际的 `overrun_minutes`；
- 一条 `execution_overrun_failed` 行为事件；
- 包含本次时间结果的状态转换记录。

用户保存本次 Session 反馈后，HumanOS 只查找当天受到影响的后续工作，并以 `execution_overrun` 为触发原因创建局部重排任务。已经实际执行的内容会被保护；未受影响的任务和 Fixed Event 保持不动。

局部重排的结果是一份 Draft Calendar Diff，而不是立即生效的正式日历。用户查看并应用调整前，原 Confirmed Plan 仍然是有效计划。如果超时没有影响任何后续工作，系统只记录这次失败，不生成没有必要的重排草案。

这对应进程超过时间片或实际执行预算以后触发增量式重新调度，而不是删除并重建整个星期的计划。

## 7. Session 结束反馈

Session 结束反馈分别更新三类信息：

1. **任务结果**：完成情况、进度、下一步、实际分钟数和剩余工作量；
2. **运行时状态**：必要时记录 Session 后的 Focus、Energy 和 Stress；
3. **推荐反馈**：用户是否接受 AI 建议，以及建议实际是否有效。

这些信息先作为 Episodic Evidence（情景证据）保存。单次行为不会直接成为稳定的用户特征；相似模式反复出现后，才可以影响后续调度策略。

## 8. 局部重排策略

HumanOS 始终优先选择影响最小的安全调整：

1. 先尝试使用当前 Session 余量、Buffer 或未使用的可用时间吸收变化；
2. 保护已经完成或正在执行的 Session，以及所有 Fixed Event；
3. 只释放真正受影响的未来 Slot；
4. 让 DeepSeek 提出新的具体时间；
5. 由 Python 重新验证所有硬约束；
6. 向用户展示局部 Calendar Diff；
7. 用户确认后才激活新的 Plan Revision。

这对应保护已提交工作的增量式调度，避免一次很小的中断导致整周计划被不必要地全部打乱。

## 9. DeepSeek、Python 与用户的职责分工

| 参与者 | 负责内容 |
| --- | --- |
| DeepSeek | 理解任务含义、Task Demand、依赖、中断上下文和并行兼容性；比较候选方案并提出具体 Session 时间。 |
| Python | 强制检查 Available Window、Fixed Event、Deadline、Dependency、工作量守恒、重叠规则、15 分钟网格、Plan 版本和幂等保存。 |
| 用户 | 提供真实约束；局部调整计划；接受或拒绝可选并行建议；处理确实无法自动解决的容量问题；确认 Plan Revision。 |

## 10. 核心状态转换

| 用户操作 | 操作前 | 操作后 | 调度含义 |
| --- | --- | --- | --- |
| Start | `ready` | `running` | Dispatch，派发任务执行 |
| Pause | `running` | `paused` | Interrupt 并保存上下文 |
| Resume | `paused` | `running` | 从等待或挂起状态恢复 |
| Switch | 当前任务 `running` | 当前任务 `paused`，新任务 `running` | Preemption 与 Context Switch |
| Finish session | `running` 或 `paused` | `ended` | 停止执行时钟，等待结果结算 |
| Feedback：完成 | `ended` | Session `completed`，Task `completed` | 正常终止 |
| Feedback：部分完成或无进展 | `ended` | Session 已结算，Task `queued` | 剩余工作回到 Ready Queue |
| 晚至少 15 分钟 Finish | `ended` | 记录 `overrun_failure` | 请求增量式重排 |
| Apply Calendar Diff | Confirmed Revision N | Confirmed Revision N+1 | 原子式激活新的计划版本 |

## 11. 后端保留的研究事件

后端保留可审计的行为事件，但普通用户界面不展示开发日志，包括：

- Session 的 Start、Pause、Resume、End 和 Feedback 状态转换；
- Context Dump 和中断原因；
- 用户接受或拒绝 HumanOS 推荐的记录；
- `execution_overrun_failed` 及其超时分钟数；
- `execution_overrun_replan_requested` 及受影响的 Task ID；
- Plan Revision 的生成、验证和确认。

这些数据可以用于后续分析中断行为、任务超时、推荐质量和调度适应效果，同时保持用户端流程简洁。
