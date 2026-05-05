const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { authenticateToken, signToken } = require('./authMiddleware');

const app = express();
app.use(cors());
app.use(express.json());

const projectQuery = db.prepare(
  `SELECT p.*, u.name AS owner_name, u.email AS owner_email
   FROM projects p
   JOIN users u ON p.owner_id = u.id
   WHERE p.id = ?`
);

function requireProjectMembership(userId, projectId) {
  return db.prepare(
    `SELECT * FROM project_members WHERE project_id = ? AND user_id = ?`
  ).get(projectId, userId);
}

function requireProjectAdmin(userId, projectId) {
  const membership = requireProjectMembership(userId, projectId);
  if (!membership) return null;
  return membership.role === 'admin' ? membership : null;
}

function findUserByEmail(email) {
  return db.prepare('SELECT id, name, email, role, password FROM users WHERE email = ?').get(email);
}

function getProjectMembers(projectId) {
  return db.prepare(
    `SELECT u.id, u.name, u.email, pm.role
     FROM project_members pm
     JOIN users u ON pm.user_id = u.id
     WHERE pm.project_id = ?`
  ).all(projectId);
}

function getProjectTasks(projectId) {
  return db.prepare(
    `SELECT t.*, u.name AS assignee_name, u.email AS assignee_email
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.project_id = ?
     ORDER BY t.due_date IS NULL, t.due_date ASC, t.id DESC`
  ).all(projectId);
}

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already in use.' });

  const hash = bcrypt.hashSync(password, 10);
  const role = db.prepare('SELECT COUNT(1) AS userCount FROM users').get().userCount === 0 ? 'admin' : 'member';
  const result = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(name, email.toLowerCase(), hash, role);
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({ user, token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const user = db.prepare('SELECT id, name, email, role, password FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  const payloadUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = signToken(payloadUser);
  res.json({ user: payloadUser, token });
});

app.get('/api/users/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

app.get('/api/dashboard', authenticateToken, (req, res) => {
  const projects = db.prepare(
    `SELECT p.id, p.name, p.description, p.owner_id, COUNT(t.id) AS taskCount,
            SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS completedCount
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE pm.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC`
  ).all(req.user.id);

  const overdue = db.prepare(
    `SELECT COUNT(*) AS overdueCount FROM tasks t
     JOIN project_members pm ON pm.project_id = t.project_id
     WHERE pm.user_id = ? AND t.due_date < date('now') AND t.status != 'Done'`
  ).get(req.user.id);

  const statuses = db.prepare(
    `SELECT t.status, COUNT(*) AS total FROM tasks t
     JOIN project_members pm ON pm.project_id = t.project_id
     WHERE pm.user_id = ?
     GROUP BY t.status`
  ).all(req.user.id);

  const tasks = db.prepare(
    `SELECT t.*, p.name AS project_name, u.name AS assignee_name
     FROM tasks t
     JOIN projects p ON t.project_id = p.id
     JOIN project_members pm ON pm.project_id = p.id
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE pm.user_id = ?
     ORDER BY t.due_date IS NULL, t.due_date ASC, t.id DESC
     LIMIT 10`
  ).all(req.user.id);

  res.json({ projects, overdue: overdue.overdueCount || 0, statuses, tasks });
});

app.get('/api/projects', authenticateToken, (req, res) => {
  const rows = db.prepare(
    `SELECT p.id, p.name, p.description, p.owner_id, u.name AS owner_name,
            pm.role AS my_role, p.created_at
     FROM projects p
     JOIN project_members pm ON p.id = pm.project_id
     JOIN users u ON p.owner_id = u.id
     WHERE pm.user_id = ?
     ORDER BY p.created_at DESC`
  ).all(req.user.id);
  res.json(rows);
});

app.post('/api/projects', authenticateToken, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required.' });
  const project = db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)').run(name, description || '', req.user.id);
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(project.lastInsertRowid, req.user.id, 'admin');
  res.status(201).json({ id: project.lastInsertRowid, name, description, owner_id: req.user.id });
});

app.get('/api/projects/:projectId', authenticateToken, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!requireProjectMembership(req.user.id, projectId)) return res.status(403).json({ error: 'Access denied.' });
  const project = projectQuery.get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  const members = getProjectMembers(projectId);
  const tasks = getProjectTasks(projectId);
  res.json({ ...project, members, tasks });
});

app.post('/api/projects/:projectId/members', authenticateToken, (req, res) => {
  const projectId = Number(req.params.projectId);
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Member email is required.' });
  if (!requireProjectAdmin(req.user.id, projectId)) return res.status(403).json({ error: 'Admin access required.' });
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found. Ask them to sign up first.' });
  if (requireProjectMembership(user.id, projectId)) return res.status(409).json({ error: 'User already belongs to this project.' });
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, user.id, role === 'admin' ? 'admin' : 'member');
  res.status(201).json({ userId: user.id, name: user.name, email: user.email, role: role === 'admin' ? 'admin' : 'member' });
});

app.post('/api/tasks', authenticateToken, (req, res) => {
  const { project_id, title, description, assigned_to, due_date } = req.body;
  if (!project_id || !title) return res.status(400).json({ error: 'Project and task title are required.' });
  if (!requireProjectMembership(req.user.id, project_id)) return res.status(403).json({ error: 'Access denied.' });
  if (assigned_to) {
    const membership = requireProjectMembership(assigned_to, project_id);
    if (!membership) return res.status(400).json({ error: 'Assigned user must be a project member.' });
  }
  const result = db.prepare(
    'INSERT INTO tasks (project_id, title, description, assigned_to, due_date) VALUES (?, ?, ?, ?, ?)' 
  ).run(project_id, title, description || '', assigned_to || null, due_date || null);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(task);
});

app.patch('/api/tasks/:taskId/status', authenticateToken, (req, res) => {
  const taskId = Number(req.params.taskId);
  const { status } = req.body;
  if (!['Pending', 'In Progress', 'Blocked', 'Done'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!requireProjectMembership(req.user.id, task.project_id)) return res.status(403).json({ error: 'Access denied.' });
  db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, taskId);
  res.json({ id: taskId, status });
});

app.patch('/api/tasks/:taskId', authenticateToken, (req, res) => {
  const taskId = Number(req.params.taskId);
  const { title, description, assigned_to, due_date, status } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!requireProjectMembership(req.user.id, task.project_id)) return res.status(403).json({ error: 'Access denied.' });
  const projectAdmin = requireProjectAdmin(req.user.id, task.project_id);
  if (!projectAdmin && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Only admins or assignees can update this task.' });
  }
  if (assigned_to) {
    const membership = requireProjectMembership(assigned_to, task.project_id);
    if (!membership) return res.status(400).json({ error: 'Assigned user must be a project member.' });
  }
  const updated = db.prepare(
    `UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description),
      assigned_to = ?, due_date = COALESCE(?, due_date),
      status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    title || null,
    description || null,
    assigned_to ?? task.assigned_to,
    due_date || null,
    status || null,
    taskId
  );
  const changed = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  res.json(changed);
});

app.delete('/api/projects/:projectId', authenticateToken, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!requireProjectAdmin(req.user.id, projectId)) return res.status(403).json({ error: 'Admin access required.' });
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  if (result.changes === 0) return res.status(404).json({ error: 'Project not found.' });
  res.status(204).send();
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Team Task Manager API listening on http://localhost:${PORT}`);
});
