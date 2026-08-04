SAT Prep Explorer

AI-Powered Adaptive Learning Platform

Personalizing how students learn, not just what they practice.

Built with React, Node.js, MongoDB, Claude AI, and Stripe.

🚧 Private MVP · 🤖 AI-Native · 👩‍🏫 Teacher Reviewed · 📊 Evidence-Driven Product Development



Why We Built This

After more than a decade working directly with students, parents, and educators, we observed the same pattern across nearly every SAT preparation program.

Most platforms personalize the initial diagnostic assessment—but not the learning journey that follows.

Students with different strengths, learning habits, and target scores often receive nearly identical study plans, practice questions, and review schedules.

We believe personalization should be continuous.

SAT Prep Explorer combines AI, human expertise, and real learning data to build learning experiences that continuously adapt to each student.

We don't personalize the test.

We personalize the learning journey.

Our Approach

SAT Prep Explorer is built around four principles.

🎯 Adaptive Learning

Learning plans evolve continuously based on each student's performance, goals, and progress.

Personalization is an ongoing process—not a one-time diagnostic.

🤖 AI + Human Collaboration

AI accelerates content creation.

Teachers validate every question before students see it.

Human judgment remains the final quality gate.

📊 Evidence-Driven Product Development

Every major product decision is informed by continuous learning from:

Students

Parents

SAT teachers

We build based on evidence—not assumptions.

⭐ Quality Before Scale

Educational AI should earn trust before pursuing growth.

We prioritize:

Learning quality

Question quality

Student trust

before shipping new features.

🌐 Private MVP Demo

👉 https://sat-prep-platform-beta.vercel.app

🚀 Current Status

✅ Completed

User Registration

User Login

JWT Authentication

Free / Explorer Plan Selection

MongoDB Integration

Mobile Responsive

AI Question Generation Pipeline

Teacher Review Workflow

Stripe Integration

Railway Deployment

Vercel Deployment

🚧 In Progress

Student Dashboard

Adaptive Learning Engine

AI Performance Analysis

🎯 Next

Private Beta

Parent Dashboard

Wrong Book

AP & ACT Expansion

✨ Features

Feature

Free

Explorer

Adaptive practice tests (MST model)

✅ 3/month

✅ Unlimited

AI-generated questions

✅

✅

Score report with accuracy %

✅

✅

Detailed weakness analysis by domain

❌

✅

Unlimited Wrong Book review

❌

✅

Score history & progress tracking

❌

✅

Targeted drill sets by topic

❌

✅

Export results as PDF

❌

✅

AI Content Quality Pipeline

AI Question Generation
          │
          ▼
Automatic Validation
          │
          ▼
Teacher Review
          │
          ▼
Quality Approval
          │
          ▼
Student Learning

Our goal is not simply to generate more questions.

Our goal is to generate questions students can trust.

🏗️ Architecture

sat-prep-platform/
├── frontend/                  # React Single Page Application
├── backend/                   # Node.js + Express API
│   ├── src/
│   ├── scripts/
│   ├── tests/
│   └── data/
├── docs/
└── README.md

The platform consists of three primary layers:

Frontend — Student-facing React application

Backend — Authentication, adaptive testing, AI services, billing, and APIs

AI Content Pipeline — Generation, validation, teacher review, and import workflow

🚀 Quick Start

Prerequisites

Node.js 18+

MongoDB

Anthropic API Key

Stripe account (optional)

Clone

git clone https://github.com/Irisl99/sat-prep-platform.git
cd sat-prep-platform

Install

cd backend && npm install

cd ../frontend && npm install

Configure

Backend:

cp backend/.env.example backend/.env

Frontend:

cp frontend/.env.example frontend/.env

Run

Backend

cd backend
npm run dev

Frontend

cd frontend
npm run dev

Open:

http://localhost:5173

🔑 Environment Variables

Backend

Variable

Purpose

MONGODB_URI

MongoDB connection

ANTHROPIC_API_KEY

Claude API

JWT_SECRET

Authentication

STRIPE_SECRET_KEY

Stripe payments

STRIPE_WEBHOOK_SECRET

Webhook verification

FRONTEND_URL

CORS origin

PORT

Backend port

Frontend

Variable

Purpose

VITE_API_URL

Backend API URL

VITE_STRIPE_PUBLISHABLE_KEY

Stripe public key

💳 Freemium Model

Free

3 adaptive SAT practice tests per month

Basic score report

AI-generated questions

Explorer

$9.99/month or $79/year

Unlimited adaptive practice

Detailed weakness analysis

Personalized drill recommendations

Unlimited Wrong Book review

Score history

Learning analytics

PDF exports

Payments are securely processed through Stripe Checkout.

🚢 Deployment

Frontend: Vercel

cd frontend
vercel --prod

Backend: Railway

railway up

Database: MongoDB Atlas

📡 API Reference

POST /api/auth/register
POST /api/auth/login
GET  /api/user/me

POST /api/exam/start
POST /api/exam/:id/submit
GET  /api/exam/:id/results

GET  /api/user/history
GET  /api/user/wrongbook

POST /api/billing/checkout
POST /api/billing/webhook

Full API documentation will be published under docs/api.md.

🤝 Contributing

SAT Prep Explorer is currently under active private development.

At this stage, we are not accepting external code contributions or pull requests.

Community collaboration may open after public beta as the platform matures.

If you're interested in educational AI, adaptive learning, or future collaboration, feel free to reach out.

💡 Founder Note

SAT Prep Explorer began after years of working directly with students, parents, and educators.

The goal was never to build another SAT question bank.

The goal is to build an adaptive learning platform that continuously learns alongside every student.

Technology scales.

Trust compounds.

We're just getting started.

📄 License

Copyright © 2026 Iris Li.

All rights reserved.

This repository is publicly visible for demonstration purposes only.

No part of this source code may be copied, modified, redistributed, or used for commercial purposes without prior written permission.

⚠️ Disclaimer

SAT Prep Explorer is an independent educational technology project.

It is not affiliated with, endorsed by, or sponsored by College Board®.

SAT® is a registered trademark of College Board. All trademarks belong to their respective owners.

AI-generated questions are designed for practice purposes only and should not be interpreted as official SAT materials.
