# Preliminary cross-case findings

These are candidate patterns from the first-pass audit. They are not final
themes and should not be quoted as prevalence estimates.

## 1. Plan breakdown is broader than execution interruption

The corpus includes non-start, active interruption, intentional disengagement,
and cascading dependency failure. HumanOS therefore needs to distinguish a
calendar commitment becoming infeasible from an active execution session being
paused. A single “interrupted” state would erase materially different recovery
needs.

**Provisional strength:** strong descriptive finding.

## 2. Resumption cost depends on externalized task state

Tasks with visible progress, such as vocabulary software, pages, question
numbers, or completed experimental stages, often support direct continuation.
Writing, simulation, interpretation, and other reasoning-heavy work require
reconstruction of intent, alternatives, failures, and next conceptual steps.

**Candidate design requirement:** checkpoint depth should depend on task-state
visibility and context dependence, not on a fixed form for every task.

**Provisional strength:** moderate-to-strong; needs full transcript coding.

## 3. A useful checkpoint is more than Reason–Progress–Next Step

Progress and next action recur across accounts, but high-context work also needs
material pointers and reasoning state. Conversely, resurfacing a negative reason
can itself be burdensome. The system should store reason separately and let the
user control whether it is shown during re-entry.

**Candidate design requirement:** use a modular checkpoint containing progress,
next action, optional reason, material pointer, and optional reasoning state.

**Provisional strength:** moderate because parts of the checkpoint were prompted
by the interview guide.

## 4. State changes modify task fit, not a universal energy curve

Participants described moving between experiments, writing, reading,
memorization, and routine work based on fatigue, pain, concentration, emotional
state, safety, and time. The data support momentary state–task matching, not a
population-level daily energy function.

**Candidate design requirement:** treat self-report as a time-local tailoring
variable with uncertainty; do not present inferred internal state as fact.

**Provisional strength:** strong boundary on the claim, moderate support for a
specific matching mechanism.

## 5. Low-risk automation and high-impact change have different consent needs

Saving progress, updating completion, and preparing reminders were often treated
as lower-risk. Moving work, changing priority, increasing workload, deleting
tasks, and learning durable preferences raised stronger expectations of
confirmation, editing, rejection, or undo.

**Candidate design requirement:** preserve candidate, validated, and confirmed
schedule states and provide a visible change summary.

**Provisional strength:** moderate because most evidence is hypothetical.

## 6. Evidence and explanation needs vary

Some participants requested objective reasons, historical observations, sources,
or deadline/workload calculations; others preferred a tool to give a direct
answer. Explanation should therefore be available and inspectable without being
mandatory friction for every low-impact action.

**Candidate design requirement:** progressive disclosure of evidence, with more
prominent justification for consequential or uncertain recommendations.

**Provisional strength:** moderate and heterogeneous.

## 7. Support can create burden

Persistent incomplete-work indicators, rigid reminders, mechanical scheduling,
and repeated negative explanations may increase anxiety, pressure, or rejection.
Some participants reported little need for assistance or preferred self-directed
planning.

**Candidate design requirement:** support must be pausable, dismissible, and
selective; non-use and self-sufficiency are legitimate outcomes.

**Provisional strength:** strong boundary finding.

## 8. The appropriate UbiComp claim

The interviews can support an empirically grounded design space for
interruption-aware adaptive scheduling:

- types of breakdown;
- information that can tailor a decision;
- possible decision points;
- checkpoint content;
- automation and confirmation boundaries;
- proximal outcomes to evaluate later.

They cannot establish that the resulting decision rules are correct or that
HumanOS improves completion, well-being, or resumption. Those claims require a
subsequent deployment or controlled evaluation measuring acceptance, resumption
latency, recurrent interruption, schedule modification, and task completion.
