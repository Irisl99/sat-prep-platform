# API Reference

Base URL: `https://your-backend.railway.app` (or `http://localhost:3001` locally)

All protected endpoints require: `Authorization: Bearer <JWT>`

---

## Auth

### `POST /api/auth/register`
```json
{ "name": "Jane", "email": "jane@example.com", "password": "password123" }
```
Returns: `{ token, user }`

### `POST /api/auth/login`
```json
{ "email": "jane@example.com", "password": "password123" }
```
Returns: `{ token, user }`

### `GET /api/auth/me` 🔒
Returns: `{ user: { id, name, email, plan, isPremium, usage } }`

---

## Exam

### `POST /api/exam/start` 🔒
Starts a new adaptive exam. Generates RW Module 1 (27 questions).
- **Free limit**: 3 tests/month. Returns `403` when exceeded.

Returns:
```json
{
  "examId": "...",
  "moduleId": "rw1",
  "questions": [...],   // answers stripped
  "timeSeconds": 1920
}
```

### `POST /api/exam/:id/submit-module` 🔒
Submit answers for a completed module.
```json
{
  "moduleId": "rw1",
  "answers": { "0": "A", "1": "C", "2": "B" }
}
```
Returns (if more modules remain):
```json
{
  "done": false,
  "moduleId": "rw2h",
  "questions": [...],
  "timeSeconds": 1920,
  "isBreak": false
}
```
Returns (exam complete):
```json
{ "done": true, "examId": "..." }
```

### `GET /api/exam/:id/results` 🔒
```json
{
  "scores": { "rw": 690, "math": 660, "total": 1350 },
  "moduleSequence": ["rw1","rw2h","m1","m2e"],
  "modules": [...],
  "weaknessReport": { ... },   // null if free plan
  "premiumLocked": true
}
```

### `GET /api/exam/history` 🔒 💎 Premium
Returns last 50 completed exams with scores and dates.

---

## Billing

### `POST /api/billing/checkout` 🔒
```json
{ "plan": "monthly" }   // or "yearly"
```
Returns: `{ "url": "https://checkout.stripe.com/..." }`

### `POST /api/billing/portal` 🔒
Returns: `{ "url": "https://billing.stripe.com/..." }`

### `POST /api/billing/webhook`
Stripe webhook handler. Must receive raw body.
Handles: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`

---

## Error format
```json
{ "error": "Human-readable message", "details": [...] }
```

HTTP codes: `400` validation, `401` auth, `403` forbidden/limit, `404` not found, `409` duplicate, `500` server error
