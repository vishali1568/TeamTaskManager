# Team Task Manager

A full-stack task management web app with role-based access control, project/team management, and task tracking.

## Features
- Signup / login authentication with JWT
- Project creation and membership management
- Task creation, assignment, status updates, and overdue tracking
- Role-based access control for project admins and members
- REST API backend with SQLite database
- React frontend powered by Vite

## Setup

### Backend
1. Open a terminal in `C:\Users\visha\TeamTaskManager\server`
2. Run `npm install`
3. Start the server: `npm start`
4. The backend API will run on `http://localhost:4000`

### Frontend
1. Open a terminal in `C:\Users\visha\TeamTaskManager\client`
2. Run `npm install`
3. Start the frontend: `npm run dev`
4. Open the browser at the URL shown by Vite (default `http://localhost:5173`)

## Notes
- The first user who signs up becomes an application admin.
- Project admins can invite members by email and assign them the `admin` or `member` role.
- Tasks can be marked as `Pending`, `In Progress`, `Blocked`, or `Done`.
