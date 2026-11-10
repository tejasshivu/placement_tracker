# CampusHire — College Placement Web App

Flask API + React (Vite) portal for **students**, **placement team**, and **companies**.

## Architecture

```
React (localhost:5173)  --JWT-->  Flask API (localhost:5000)  -->  SQLite
```

| Role | Can do |
|------|--------|
| Student | Register, view drives, apply, track status |
| Company | Register, await approval, post drives, manage applicants |
| Placement | Approve companies, view drives, post announcements |

## Run locally (VS Code)

### 1. Backend

```powershell
cd "c:\Users\Yashu\OneDrive\Documents\placement_tracker"
.\venv\Scripts\Activate.ps1
cd backend
python seed.py
python app.py
```

API: http://127.0.0.1:5000/api/health

Default placement login:
- email: `placement@college.edu`
- password: `placement123`

### 2. Frontend (new terminal)

```powershell
cd "c:\Users\Yashu\OneDrive\Documents\placement_tracker\frontend"
npm run dev
```

App: http://127.0.0.1:5173

## Build order (next steps)

1. ~~Resume upload for students~~ ✅  
2. Drive search & filters  
3. Email notifications  
4. Reports/export for placement team  
5. Deploy (Render/Railway + Vercel)

## Main API routes

- `POST /api/auth/register/student`
- `POST /api/auth/register/company`
- `POST /api/auth/login`
- `GET  /api/auth/me`
- `GET/PATCH /api/students/me`
- `POST /api/students/me/resume` (PDF)
- `GET  /api/students/me/resume`
- `GET  /api/students/:id/resume` (company/placement)
- `GET/POST /api/drives`
- `POST /api/applications`
- `GET  /api/applications/mine`
- `GET  /api/applications/drive/:id`
- `PATCH /api/applications/:id/status`
- `GET/POST /api/placement/announcements`
- `POST /api/placement/companies/:id/approve`
