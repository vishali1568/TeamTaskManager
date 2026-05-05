# TeamTaskManager

A full-stack task management application that allows teams to manage projects, assign tasks, and track progress with role-based access control.

## Features

- User authentication using JWT (Signup/Login)
- Project and team management
- Task creation, assignment, and updates
- Task status tracking (Pending, In Progress, Blocked, Done)
- Dashboard with task statistics
- Role-based access (Admin / Member)

## Tech Stack

- Backend: Node.js, Express
- Frontend: React (Vite)
- Database: JSON (file-based storage)

## Setup Instructions

1. Clone the Repository

git clone https://github.com/vishali1568/TeamTaskManager.git  
cd TeamTaskManager  

###2. Run Backend

cd server  
npm install  
node index.js  

Backend runs at:  
http://localhost:4000  

###3. Run Frontend

cd client  
npm install  
npm run dev  

Frontend runs at:  
http://localhost:5173  

## API Endpoints

### Authentication

Signup  
POST /api/auth/signup  

Login  
POST /api/auth/login  

### Tasks

Get Task  
GET /api/tasks/:id  

Create Task  
POST /api/tasks  

Update Task  
PUT /api/tasks/:id  

### Dashboard

GET /api/dashboard  

## Notes

- The first user who signs up becomes an admin  
- Admin users can assign tasks to others  
- Tasks include due dates and status tracking  
- Backend tested using Postman  

##  Status

Project is fully functional with working backend APIs and frontend integration.
