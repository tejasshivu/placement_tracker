# Ascendia — College Placement Web App

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

## Deploy (Render API + Vercel frontend)

1. Push this repo to GitHub.
2. **Render**: New → Blueprint → select repo (`render.yaml`), or Web Service with root `backend`, start `python seed.py && gunicorn -b 0.0.0.0:$PORT app:app`. Add free Postgres and set `DATABASE_URL`. Set `FRONTEND_ORIGIN` to your Vercel URL after step 3.
3. **Vercel**: Import repo → Root Directory `frontend` → env `VITE_API_URL` = `https://YOUR-RENDER-SERVICE.onrender.com/api` → Deploy.
4. Update Render `FRONTEND_ORIGIN` to `https://YOUR-APP.vercel.app` and redeploy API.

Default placement login after seed: `placement@college.edu` / `placement123`

**Note:** Resume/offer files on free Render use ephemeral disk — they can reset on redeploy. Postgres keeps your app data.

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
