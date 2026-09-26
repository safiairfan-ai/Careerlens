# CareerLens — AI Resume Analyzer & Job Matcher

CareerLens is a Node.js web application for reviewing resumes, comparing them with job descriptions, saving analysis reports locally, and exporting PDF summaries.

## ✨ Features

- 📄 PDF and DOCX resume upload
- 🔎 Resume text extraction
- 🤖 Resume analysis and scoring
- 🎯 ATS compatibility analysis
- 💼 Job description matching
- 🧠 Skill matching and missing-skill detection
- 📊 Resume health metrics
- 📝 Editable extracted resume text
- 🖼️ OCR support for scanned PDFs in the browser
- 💾 Saved analysis reports
- 📥 PDF report export
- 🔐 Optional OpenAI-powered feedback
- 📱 Responsive professional UI
- 🔒 Local/private-by-default workflow

## 🛠️ Tech Stack

**Frontend:** HTML5, CSS3, Vanilla JavaScript

**Backend:** Node.js, Native Node HTTP server

**Libraries:** `pdf-parse`, `mammoth`, PDF.js, Tesseract.js

## 📁 Project Structure

```text
CareerLens/
├── app.js
├── auth.css
├── index.html
├── package.json
├── package-lock.json
├── server.js
├── styles.css
├── render.yaml
├── .env.example
├── .gitignore
└── data/
    └── .gitkeep
```

## 🚀 Run Locally

Install Node.js 20 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## 🔑 Optional OpenAI Setup

Copy `.env.example` to `.env` and add:

```env
OPENAI_API_KEY=your_key_here
```

Never commit `.env` or expose your API key publicly.

## ☁️ Deploy Online

CareerLens requires a Node.js backend, so GitHub Pages alone cannot run the complete application.

The repository includes `render.yaml` for Render deployment.

**Build Command**
```text
npm install
```

**Start Command**
```text
npm start
```

If OpenAI feedback is required, add `OPENAI_API_KEY` as a secret environment variable in the hosting provider.

## 🐙 GitHub

Create a public repository named `CareerLens`, then:

```bash
git init -b main
git add .
git commit -m "Initial CareerLens release"
git remote add origin https://github.com/YOUR-USERNAME/CareerLens.git
git push -u origin main
```

## 🔒 Security Notes

- `.env` is excluded from Git.
- `node_modules/` is excluded from Git.
- Runtime report data is excluded from Git.
- Do not commit API keys or other secrets.

## 👩‍💻 Project

**CareerLens — AI Resume Analyzer & Job Matcher**