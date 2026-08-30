# HumanOS Formative Study analysis

This directory contains the auditable first-pass analysis specification for the
14 interviews collected on 25–27 August 2026. It deliberately excludes raw
transcripts and identifiable speaker names.

## Scope

The study examines four distinct questions:

1. How students represent and revise everyday plans.
2. When a planned task becomes temporarily infeasible.
3. How people choose between continuing, pausing, switching, and rescheduling.
4. What context and control an adaptive system should provide around resumption.

The analysis keeps three kinds of evidence separate:

- routine planning accounts;
- concrete breakdown, interruption, and resumption episodes;
- responses to a hypothetical adaptive system.

Hypothetical preferences can motivate candidate design requirements, but they
are not evidence that HumanOS is usable or effective.

## Files

- `methodology.md`: research questions, analytic procedure, quality controls,
  and reporting rules;
- `codebook.md`: version 0.1 code definitions and evidence-strength rules;
- `event_index.md`: anonymized first-pass index of one focal episode per
  interview;
- `event_segmentation_audit.md`: transcript-checked event boundaries and
  evidence-status distinctions before coding or theme development;
- `开放编码表_P01-P03.md`: 中文开放编码试表，用前三位参与者检查证据粒度与记录格式；
- `开放编码表_P04-P06.md`: 按 v0.1 规则完成的第二批中文开放编码；
- `开放编码表_P07-P09.md`: 经 v0.3 复查的第三批中文开放编码，保留长期连锁延期、非核心事件与强引导材料的差异；
- `开放编码表_P10-P12.md`: 按 v0.3 规则完成的第四批中文开放编码，区分具体事件、一般经验、自报与假设回答；
- `开放编码表_P13-P14.md`: 按 v0.3 规则完成的最后一批中文开放编码，保留实验安全事件与无核心失败事件的负面案例；
- `全语料开放编码审计.md`: P01–P14 共93条中文记录的覆盖、编号、证据类型、时间戳、隐私及阶段边界审计；
- `聚焦编码框架_v0.1.md`: 从286个初始标签归纳的13个候选聚焦类别及其纳入、排除和映射规则；
- `聚焦编码映射_P01-P06.md`: 前34条开放编码记录的聚焦类别试映射，保留证据类型和映射理由；
- `聚焦编码映射_P07-P09.md`: P07–P09 共22条记录的聚焦类别映射，保留项目级延期、协议边界和强引导属性；
- `聚焦编码映射_P10-P12.md`: P10–P12 共22条记录的聚焦类别映射，区分实际软件痕迹、事件、自报、一般经验与假设记录；
- `聚焦编码映射_P13-P14.md`: 最后15条记录的聚焦类别映射，保留实验安全、自然边界、低恢复需求和目标人群质疑；
- `规则复查记录_P10-P12.md`: P10–P12 编码后的规则适用性审计；结论为保持 v0.3；
- `中文开放编码规则_v0.3.md`: 经 P07–P09 第二次复查后新增强引导编号和单一证据性质要求的中文规则；
- `coded_cases.md`: timestamped, paraphrased coding record for P01–P14;
- `cross_case_matrix.md`: case-by-code charting, candidate themes, and
  countercases;
- `design_requirements.md`: traceable mapping from evidence to candidate JITAI
  components, HumanOS mechanisms, and future measures;
- `preliminary_findings.md`: provisional cross-case patterns and countercases.

## Status

This is a first-pass audit, not a completed thematic analysis. Before paper
submission, two researchers should independently review a subset of event
segmentation and descriptive codes, reconcile disagreements, update the
codebook, and re-audit every claim against timestamped transcript evidence.
