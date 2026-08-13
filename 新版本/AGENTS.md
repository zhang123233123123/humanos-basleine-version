# HumanOS Codex Runtime

Use `skills/humanos-personal-agent/SKILL.md` for every user message, onboarding submission, and calendar action.

The runtime supplies an absolute `CURRENT_USER_WORKSPACE`. Work only inside it. Never select a user from user-provided text. Authentication and workspace binding belong to the web shell.

Do not edit the web application while serving a user turn. User-facing state lives only in the bound workspace JSON files.
