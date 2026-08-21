"""Pure hard-dependency graph validation shared by planning paths."""

from __future__ import annotations

from typing import Any


def hard_dependency_cycle_ids(tasks: list[dict[str, Any]], analysis: dict[str, Any]) -> set[str]:
    """Return only task IDs inside hard cycles, including self-loops."""
    task_ids = {str(task.get("id")) for task in tasks if task.get("id")}
    graph: dict[str, set[str]] = {task_id: set() for task_id in task_ids}
    for dependency in analysis.get("dependencies") or []:
        if not isinstance(dependency, dict) or dependency.get("hard_enforced") is not True:
            continue
        before = str(dependency.get("before_task_id") or "")
        after = str(dependency.get("after_task_id") or "")
        if before in graph and after in graph:
            graph[before].add(after)

    index = 0
    indices: dict[str, int] = {}
    lowlinks: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    cyclic: set[str] = set()

    def visit(node: str) -> None:
        nonlocal index
        indices[node] = lowlinks[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)
        for successor in graph[node]:
            if successor not in indices:
                visit(successor)
                lowlinks[node] = min(lowlinks[node], lowlinks[successor])
            elif successor in on_stack:
                lowlinks[node] = min(lowlinks[node], indices[successor])
        if lowlinks[node] != indices[node]:
            return
        component: list[str] = []
        while stack:
            member = stack.pop()
            on_stack.remove(member)
            component.append(member)
            if member == node:
                break
        if len(component) > 1 or (component and component[0] in graph[component[0]]):
            cyclic.update(component)

    for task_id in sorted(graph):
        if task_id not in indices:
            visit(task_id)
    return cyclic
