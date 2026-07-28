# SAT Prep Explorer

AI-powered adaptive SAT learning platform that personalizes every student's learning journey.

Built with React, Node.js, MongoDB, Claude AI, and Stripe.

## 🌐 Live Demo

👉 **[sat-prep-platform-beta.vercel.app](https://sat-prep-platform-beta.vercel.app)**



> AI-powered adaptive SAT practice — built on the official College Board **Multistage Adaptive Testing (MST)** model.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🚀 Current Progress

### ✅ Sprint 1
- User Registration
- User Login
- JWT Authentication
- Free / Explorer Plan Selection
- MongoDB Integration
- Mobile Responsive

### 🚧 Sprint 2
- Student Dashboard (In Progress)

## 🗺️ Product Roadmap

- ✅ User Authentication
- 🚧 Student Dashboard
- ⏳ Adaptive Testing Engine
- ⏳ AI Performance Analysis
- ⏳ Wrong Book
- ⏳ Parent Dashboard



## ✨ Features

| Feature | Free | Explorer |
|---|---|---|
| Adaptive practice tests (MST model) | ✅ 3/month | ✅ Unlimited |
| AI-generated questions | ✅ | ✅ |
| Score report with accuracy % | ✅ | ✅ |
| Detailed weakness analysis by domain | ❌ | ✅ |
| Unlimited wrong-book review | ❌ | ✅ |
| Score history & progress tracking | ❌ | ✅ |
| Targeted drill sets by topic | ❌ | ✅ |
| Export results as PDF | ❌ | ✅ |

---

## 🏗️ Architecture

```
sat-prep-platform/
├── frontend/          # React SPA
│   └── src/
│       ├── components/   # Reusable UI
│       ├── pages/        # Route-level views
│       ├── hooks/        # Custom React hooks
│       └── utils/        # Helpers & API client
├── backend/           # Node.js + Express API
│   └── src/
│       ├── routes/       # REST endpoints
│       ├── middleware/    # Auth, rate limiting, freemium gates
│       ├── models/        # MongoDB schemas
│       └── services/      # AI generation, scoring, Stripe
└── docs/              # API docs, architecture diagrams
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or [Atlas](https://www.mongodb.com/atlas))
- Anthropic API key → [console.anthropic.com](https://console.anthropic.com)
- Stripe account (for payments) → [stripe.com](https://stripe.com)

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/sat-prep-platform.git
cd sat-prep-platform

# Install backend deps
cd backend && npm install

# Install frontend deps
cd ../frontend && npm install
```

### 2. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Fill in: MONGODB_URI, ANTHROPIC_API_KEY, JWT_SECRET, STRIPE_SECRET_KEY

# Frontend
cp frontend/.env.example frontend/.env
# Fill in: VITE_API_URL, VITE_STRIPE_PUBLISHABLE_KEY
```

### 3. Run locally

```bash
# Terminal 1 — backend (port 3001)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `ANTHROPIC_API_KEY` | Claude API key for question generation |
| `JWT_SECRET` | Secret for signing JWTs (32+ random chars) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `FRONTEND_URL` | Frontend origin for CORS (e.g. `https://yourapp.com`) |
| `PORT` | Server port (default: `3001`) |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL (e.g. `http://localhost:3001`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...`) |

---

## 💳 Freemium Model

- **Free tier**: 3 full adaptive tests per month, basic score report
- **Explorer** ($29.99/month): unlimited tests, detailed weakness analysis, drill sets, PDF export, score history
- Payments handled by **Stripe Checkout** — no card data touches your server
- Plan gating enforced server-side via middleware (never trust the client)

---

## 🚢 Deployment

### Backend → Railway / Render

```bash
# railway.toml already included — just connect your GitHub repo
railway up
```

### Frontend → Vercel

```bash
cd frontend
vercel --prod
```

### Database → MongoDB Atlas

1. Create a free M0 cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Whitelist your server IP
3. Paste the connection string into `MONGODB_URI`

---

## 📡 API Reference

Full API docs at [`/docs/api.md`](docs/api.md). Key endpoints:

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/user/me

POST   /api/exam/start          # generate adaptive exam
POST   /api/exam/:id/submit     # submit module, get routing decision
GET    /api/exam/:id/results    # full results + weakness analysis

GET    /api/user/history        # score history (premium)
GET    /api/user/wrongbook      # wrong-book questions (premium)

POST   /api/billing/checkout    # create Stripe checkout session
POST   /api/billing/webhook     # Stripe webhook handler
```

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

- 🐛 Bug reports → [open an issue](../../issues)
- 💡 Feature ideas → [start a discussion](../../discussions)
- 🔧 Pull requests → fork → branch → PR against `main`

---

## 📄 License

MIT © 2024 — free to use, modify, and distribute. Commercial use permitted.

---

## ⚠️ Disclaimer

This platform generates AI-simulated SAT-style questions for practice purposes. It is not affiliated with, endorsed by, or connected to College Board®. SAT® is a registered trademark of College Board.
