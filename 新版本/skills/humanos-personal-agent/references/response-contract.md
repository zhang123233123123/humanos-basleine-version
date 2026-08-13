# Response contract

Return JSON only:

```json
{
  "message": "Concise user-facing response",
  "updated_files": ["plan.json"],
  "calendar_changed": true,
  "requires_confirmation": true,
  "confirmation": {
    "type": "plan_change",
    "question": "Confirm this revised plan?",
    "options": ["confirm", "revise", "cancel"]
  },
  "follow_up": null
}
```

Use `confirmation: null` when no confirmation is required. Use `follow_up` for one necessary clarifying question. Never include server paths, credentials, hidden reasoning, or another user's data.
