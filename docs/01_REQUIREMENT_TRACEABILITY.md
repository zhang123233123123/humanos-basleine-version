# HumanOS 需求追踪矩阵

## 1. 文档目的

本文件将《HumanOS 完整 UX 流程设计》转换为可实现、可测试、可追踪的工程需求。它是产品文档与代码之间的索引，不替代页面规范、API 契约或领域模型。

## 2. 状态定义

| 状态 | 含义 |
|---|---|
| `implemented` | 已存在主要代码路径，仍需保留回归测试 |
| `partially_implemented` | 已有基础能力，但体验、数据一致性或异常路径不完整 |
| `not_implemented` | 尚未发现对应实现 |
| `needs_verification` | 代码存在，但必须通过前后端与服务器场景确认 |
| `design_conflict` | UX 文档与当前架构存在冲突，需要先作设计决策 |

## 3. 全局工程原则

1. 后端的 Active Plan Revision 是正式计划的唯一来源。
2. Calendar、Focus、Up Next 和桌宠不得自行计算正式 Session 时间或状态。
3. AI 负责理解意图和软建议；Python 负责排程计算与硬约束验证。
4. 所有计划修改先生成 Draft/Calendar Diff，用户确认后才创建正式 revision。
5. Task、Plan、Timeline Interval 和 Execution Session 使用稳定 ID，并保留历史关系。
6. 普通账号只展示产品功能；Test Clock、QA Scenario 和 Developer Snapshot 仅测试账号可用。

## 4. 需求追踪矩阵

### A. 首次设置与本周建模

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| ONB-01 | 首次设置收集 Study Context 与 Planning Background | `partially_implemented` | Profile 与研究背景字段已存在 | 对照四步 Wizard 字段和文案 | 新账号完成首次设置后检查 Profile |
| ONB-02 | Working Rhythm 作为长期倾向保存 | `partially_implemented` | Profile 包含专注、精力和任务偏好 | 明确单次状态不能覆盖长期字段 | 单次 Check-in 后比较 Profile |
| ONB-03 | Weekly Context 区分 Available、Fixed、Routine、Flexible、Buffer | `partially_implemented` | Weekly Setup 与排程 Context 已存在 | 页面字段、移动边界和持久化需统一 | 创建五类时间并读取周数据 |
| ONB-04 | Wizard Task Row 创建即获得稳定 task_id | `needs_verification` | 后端 Task ID 稳定 | 检查前端预览到确认是否保持 ID | 编辑预览任务并确认后比对 ID |
| ONB-05 | 首次设置完成后直接生成 Draft Plan | `needs_verification` | 排程与 Proposed Plan 已实现 | 验证 Wizard 到 Calendar 的完整跳转 | 新 QA 场景端到端测试 |

### B. 任务解析与分类

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| TSK-01 | 中英文自然语言可批量解析独立任务 | `implemented` | PydanticAI typed parser | 增加固定回归样例 | 8 项中英文任务解析 |
| TSK-02 | Deadline 与 Start Time 严格区分 | `implemented` | ParsedTask 时间语义验证 | 保持相对日期回归 | 检查 fixed_event 与 flexible_task |
| TSK-03 | 解析后通过硬编码计算 domain_type | `implemented` | Task domain classifier | 扩充关键词与冲突优先级 | 研究、沟通、创作、行政、个人、学习 |
| TSK-04 | Python 最终检查分类及字段合法性 | `implemented` | classification_validation | 将错误映射为统一 API 错误码 | 检查 checked_by 与 errors |
| TSK-05 | 解析只生成 Preview，确认后才创建任务 | `implemented` | Chat Turn 返回 is_preview | 检查所有入口一致 | 解析前后比较任务数量 |
| TSK-06 | 长任务依据专注时长拆为多个 Session | `partially_implemented` | Scheduler 有 session 拆分逻辑 | 验证休息与每日负荷约束 | 排程 150 分钟任务 |

### C. Draft Plan 与统一时间轴

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| PLN-01 | Plan 具有 proposed、confirmed、needs_update、superseded | `implemented` | Plans 状态与 revision 逻辑 | 形成正式状态机文档 | 修改确认计划并检查历史 |
| PLN-02 | 每个 Plan Revision 保存统一 weekly_timeline | `implemented` | Canonical Weekly Timeline | 旧计划仅在新 revision 时自然升级 | 新建计划检查 plan_json |
| PLN-03 | Interval 同时保存周坐标和绝对时间 | `implemented` | Timeline normalizer | 明确夏令时与跨日策略 | 校验 start_at/end_at |
| PLN-04 | Python 验证窗口、冲突、Deadline、Dependency、工作量 | `implemented` | Legacy rules + canonical timeline validator | 统一 violation code 文档 | 构造每类违规计划 |
| PLN-05 | AI 只处理语义与软风险，Python 生成时间并最终拒绝硬违规 | `design_conflict` | 当前同时存在 Python candidates 与 AI refinement | UX 文档仍写 DeepSeek 直接生成时间 | 在 AI/Scheduler 架构文档定稿 |
| PLN-06 | 无法完全排入时显式返回 unscheduled work | `implemented` | unscheduled_tasks 与工作量验证 | 前端提示需统一 | 构造容量不足场景 |
| PLN-07 | 所有 Draft Slot 带 week_id、revision、start_at、end_at | `implemented` | Plan 装饰与 Timeline snapshot | 验证候选计划字段一致 | 查看 Proposed Plan API |

### D. Calendar 与 Plan Review

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| CAL-01 | Calendar 显示月、周、日三种稳定视图 | `needs_verification` | 前端已有视图切换 | 月视图历史上出现过布局乱码 | 三种分辨率逐一检查 |
| CAL-02 | Draft 与 Confirmed 有清晰且无障碍的视觉差异 | `partially_implemented` | 已有草案与确认样式 | 检查 reduced-motion 和非动画标识 | 开启 reduced-motion 测试 |
| CAL-03 | 右侧显示任务、Deadline 与 Planned Sessions | `partially_implemented` | Plan Review 已存在 | 检查窄屏遮挡和信息密度 | 1366x768 检查 |
| CAL-04 | 整份计划只有一个确认按钮 | `implemented` | 一键加入/确认计划 | 统一按钮名称与位置 | 生成 8 项 Draft 检查一次确认 |
| CAL-05 | 用户可 Edit、Cancel、拖动和缩放 | `partially_implemented` | 已有编辑与拖动链路 | 删除/取消语义和 resize 需验收 | 每种操作创建新 revision |
| CAL-06 | 拖动后询问原因，但允许跳过 | `implemented` | Plan edit episode/rationale | 前端触发时机需验收 | 拖动并确认修改 |
| CAL-07 | 修改计划后 Calendar、Task Slot、Execution Panel 同步 revision | `implemented` | Confirm 创建新 Sessions 并淘汰旧 ready/paused | 服务器回归仍必须保留 | 修改已确认计划后查看三处 |
| CAL-08 | 前端不得直接顺延后续任务 | `needs_verification` | 后端已有统一 revision 路径 | 搜索并移除残留客户端排程计算 | Pause/拖动后对比 API 与 UI |

### E. Focus 与 Execution Session

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| EXE-01 | 到点在前台进入 Focus Ready | `partially_implemented` | Focus 与 current_execution 已存在 | 自动导航策略需前端验收 | Test Clock 推进到开始时间 |
| EXE-02 | 用户点击 Start 才写 actual_start_at | `implemented` | Execution start endpoint | 检查提前进入时立即开始逻辑 | 提前进入后点击 Start |
| EXE-03 | Focus、Calendar、Up Next 读取同一 Active Session | `partially_implemented` | current_execution 是统一后端入口 | 前端所有组件数据源需审计 | 同时观察三处状态 |
| EXE-04 | 正常 Break 与异常 Pause 分开处理 | `partially_implemented` | Pause 数据结构已存在 | Break 独立状态与超时逻辑需验收 | 5 分钟 Break 与 Pause 对比 |
| EXE-05 | Pause 保存 reason、progress、next_step、resume preference | `implemented` | Execution Session pause/context 数据 | 前端字段完整性需验收 | Pause 后查看 Developer Snapshot |
| EXE-06 | Resume 根据真实当前时间重新检查后续冲突 | `partially_implemented` | Resume/replan 后端路径存在 | 四种恢复选项和 Calendar Diff 需验收 | 延迟占用下一 Session 场景 |
| EXE-07 | Switch 推荐更轻任务且保留原任务 Context Dump | `partially_implemented` | Ready Queue 与 paused session 存在 | 推荐规则与前端入口需验收 | 高压力状态下 Switch |
| EXE-08 | Finish 区分完成、部分完成、无进展、未开始 | `partially_implemented` | Execution completion outcome 存在 | 前端反馈卡与剩余工作联动 | 四种 outcome 分别测试 |
| EXE-09 | 旧 revision 的 ready/paused Session 不再出现 | `implemented` | 确认新 revision 后 superseded | 保留 running 与 ended 历史 | 修改计划后查 Session 列表 |

### F. AI Chat 与计划助手

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| AI-01 | Calendar Advisor 为只读查询和解释入口 | `implemented` | calendar_advisor 模式 | 前端角色说明需统一 | 查询今日安排不创建任务 |
| AI-02 | 修改意图转交 Task Planner 并生成 Preview | `implemented` | planner_handoff | 验证中英文意图边界 | 查询与新增各测试一次 |
| AI-03 | Apply/Cancel 后提供短暂 Undo | `partially_implemented` | 修改事件记录存在 | 前端 Undo 生命周期需验收 | 应用修改后撤销 |
| AI-04 | 内部 Prompt、Python 日志不进入聊天记录 | `needs_verification` | 聊天保存结构已区分 metadata | 检查生产聊天历史 | 完成一次排程并读取 turns |
| AI-05 | 普通账号具有任务解析权限 | `needs_verification` | 接口当前按 user_id 工作 | 需要权限回归与越权检查 | 普通账号解析并确认任务 |

### G. Daily Check-in、Insights 与周迁移

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| LRN-01 | 每天本地日期只显示一次 Daily Check-in | `implemented` | last_daily_checkin_date | 跨时区和 Not Now 语义需验收 | Test Clock 跨日 |
| LRN-02 | Check-in 只影响今天第一个未开始 Session | `partially_implemented` | evaluate_daily_checkin 存在 | 验证不改写整周 | 低能量 Check-in 后比较 revision |
| LRN-03 | 行为先进入 Episodic Memory | `implemented` | episodic_memory 存储 | 统一事件证据字段 | Finish/Pause 后查看 Memory |
| LRN-04 | 重复 3–5 次或用户确认后才形成 Learned Pattern | `partially_implemented` | Pattern promotion 已存在 | 阈值、候选与确认状态需文档化 | 重复场景与手工确认 |
| LRN-05 | Insights 区分 Observation、Candidate、Confirmed | `partially_implemented` | Insights 页面和 confirmed pattern 存在 | 三层展示与删除能力不完整 | 创建候选并确认/忽略/删除 |
| LRN-06 | 新周可沿用未完成任务或从头开始 | `implemented` | Week Rollover 接口与页面 | 历史只读展示需验收 | 跨周带入 remaining work |
| LRN-07 | 一次性事件不自动复制，Routine 可选择沿用 | `partially_implemented` | Rollover 逻辑存在 | 每类 Weekly Context 迁移测试 | 创建混合 Context 后跨周 |

### H. 并行任务

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| PAR-01 | AI 识别低冲突并行机会 | `implemented` | parallel_suggestions | 增加语义分类案例 | Laundry + podcast |
| PAR-02 | Pair 必须由用户 Accept/Decline | `partially_implemented` | 建议带 confirmation 字段 | 前端交互需验收 | 不接受时确认计划应拒绝重叠 |
| PAR-03 | Python 限制最多两个任务并阻止资源冲突 | `implemented` | parallel group/resource validation | 统一 violation 文案 | 三项重叠与双语言任务 |
| PAR-04 | Calendar 清晰显示 Parallel Pair | `needs_verification` | 后端输出 group id | 前端并排/关联视觉需检查 | 接受 Pair 后查看周视图 |

### I. Settings、国际化和 QA

| ID | 需求 | 当前状态 | 当前依据 | 缺口/下一步 | 验收方式 |
|---|---|---|---|---|---|
| SYS-01 | 所有普通页面支持中英文切换 | `partially_implemented` | en/zh 资源已存在 | 检查硬编码中文与英文缺项 | 两种语言遍历所有页面 |
| SYS-02 | Settings 统一展示 Profile、AI、Memory、通知和隐私 | `partially_implemented` | 重构后的 Settings 页面存在 | 信息架构和移动端需验收 | 桌面/移动布局检查 |
| SYS-03 | 五个 QA 账号具有测试权限 | `implemented` | account_capabilities | 保持账号初始化脚本一致 | 五个账号逐一登录 |
| SYS-04 | Test Clock 只对测试账号开放 | `implemented` | account_type 权限检查 | 检查普通账号越权 | 普通账号调用返回拒绝 |
| SYS-05 | Developer Snapshot 展示 revision、session 和诊断 | `implemented` | developer_snapshot | 增加 Timeline 与 parser 分类详情 | 制造 mismatch 并查看告警 |
| SYS-06 | QA Scenario Loader 可复现关键流程 | `needs_verification` | QA tools 权限存在 | 场景清单与清理策略需明确 | 五类场景逐一加载 |
| SYS-07 | 服务器前后端端口和鉴权配置一致 | `needs_verification` | 当前后端监听 8787，前端由 PM2 托管 | 建立部署配置文档和健康检查 | 登录、解析、排程、执行 smoke test |

## 5. 优先级建议

### P0：数据一致性与不可逆错误

- `CAL-07` 修改计划后的 revision 同步
- `CAL-08` 禁止前端自行排程
- `EXE-03` 统一 Active Session
- `EXE-06` Resume 冲突重算
- `EXE-09` 淘汰旧 revision Session
- `PLN-04` Python 硬约束验证

### P1：核心闭环体验

- `ONB-05` 首次生成 Draft Plan
- `CAL-04` 整份计划一次确认
- `EXE-01` Focus Ready
- `EXE-04` Break/Pause 分离
- `EXE-08` Finish Feedback
- `LRN-01` Daily Check-in

### P2：长期学习、辅助体验和完善度

- Insights 三层模式管理
- Parallel Pair 视觉表达
- 桌宠与跨软件能力
- 全页面国际化
- Developer Snapshot 扩展

## 6. 后续拆分顺序

1. 根据本矩阵生成页面与交互规范。
2. 将 P0 项映射到领域状态机和 API 契约。
3. 为每个 P0 项建立独立 QA 场景。
4. 完成一个纵向切片后更新本矩阵状态，而不是只在提交信息中声明完成。

## 7. 本阶段完成标准

- UX 总文档中的主要流程均具有唯一需求编号。
- 每项需求都有当前状态、代码依据、缺口和验收方式。
- P0/P1/P2 优先级明确。
- 后续页面、领域、API 和 QA 文档能够引用这些编号。
