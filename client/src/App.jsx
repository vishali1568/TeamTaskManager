import { useEffect, useMemo, useState } from 'react';

const BASE_URL = 'http://localhost:4000/api';
const STATUSES = ['Pending', 'In Progress', 'Blocked', 'Done'];

function formatDate(dateString) {
  if (!dateString) return 'No due date';
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

function statusClass(status) {
  if (status === 'Done') return 'status-done';
  if (status === 'In Progress') return 'status-progress';
  if (status === 'Blocked') return 'status-blocked';
  return 'status-pending';
}

function App() {
  const [token, setToken] = useState(window.localStorage.getItem('ttm_token'));
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [dashboard, setDashboard] = useState({ projects: [], overdue: 0, statuses: [], tasks: [] });
  const [activeProject, setActiveProject] = useState(null);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('login');
  const [auth, setAuth] = useState({ name: '', email: '', password: '' });
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [memberForm, setMemberForm] = useState({ email: '', role: 'member' });
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskForm, setEditTaskForm] = useState({ title: '', description: '', assigned_to: '', due_date: '' });

  const authHeader = useMemo(() => ({ Authorization: token ? `Bearer ${token}` : '' }), [token]);

  useEffect(() => {
    if (!token) return;
    fetchUser();
    fetchDashboard();
    fetchProjects();
  }, [token]);

  async function api(path, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      method: options.method || 'GET',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Server error');
    return data;
  }

  async function fetchUser() {
    try {
      const data = await api('/users/me', { headers: authHeader });
      setUser(data);
    } catch (err) {
      console.error(err);
      handleLogout();
    }
  }

  async function fetchDashboard() {
    try {
      const data = await api('/dashboard', { headers: authHeader });
      setDashboard(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchProjects() {
    try {
      const data = await api('/projects', { headers: authHeader });
      setProjects(data);
      if (data.length) {
        const selectedId = activeProject?.id || data[0].id;
        fetchProjectDetail(selectedId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchProjectDetail(projectId) {
    try {
      const data = await api(`/projects/${projectId}`, { headers: authHeader });
      setActiveProject(data);
    } catch (err) {
      console.error(err);
      setMessage(err.message);
    }
  }

  async function handleLogin() {
    try {
      const payload = await api('/auth/login', { method: 'POST', body: { email: auth.email, password: auth.password } });
      window.localStorage.setItem('ttm_token', payload.token);
      setToken(payload.token);
      setMode('login');
      setMessage('Logged in successfully.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleSignup() {
    try {
      const payload = await api('/auth/signup', { method: 'POST', body: { name: auth.name, email: auth.email, password: auth.password } });
      window.localStorage.setItem('ttm_token', payload.token);
      setToken(payload.token);
      setMode('login');
      setMessage('Signup complete. Welcome!');
    } catch (err) {
      setMessage(err.message);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('ttm_token');
    setToken(null);
    setUser(null);
    setProjects([]);
    setActiveProject(null);
    setDashboard({ projects: [], overdue: 0, statuses: [], tasks: [] });
  }

  async function createProject() {
    try {
      const result = await api('/projects', { method: 'POST', headers: authHeader, body: projectForm });
      setProjectForm({ name: '', description: '' });
      setMessage('Project created successfully.');
      fetchProjects();
      fetchProjectDetail(result.id);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function addMember() {
    if (!activeProject) return;
    try {
      await api(`/projects/${activeProject.id}/members`, {
        method: 'POST',
        headers: authHeader,
        body: { email: memberForm.email, role: memberForm.role },
      });
      setMemberForm({ email: '', role: 'member' });
      setMessage('Member invited to project.');
      fetchProjectDetail(activeProject.id);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function createTask() {
    if (!activeProject) return;
    try {
      await api('/tasks', {
        method: 'POST',
        headers: authHeader,
        body: {
          project_id: activeProject.id,
          title: taskForm.title,
          description: taskForm.description,
          assigned_to: taskForm.assigned_to || null,
          due_date: taskForm.due_date || null,
        },
      });
      setTaskForm({ title: '', description: '', assigned_to: '', due_date: '' });
      setMessage('Task created.');
      fetchProjectDetail(activeProject.id);
      fetchDashboard();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function updateTask(taskId, updates) {
    try {
      await api(`/tasks/${taskId}`, {
        method: 'PATCH',
        headers: authHeader,
        body: updates,
      });
      setMessage('Task updated.');
      fetchProjectDetail(activeProject.id);
      fetchDashboard();
      setEditingTask(null);
      setEditTaskForm({ title: '', description: '', assigned_to: '', due_date: '' });
    } catch (err) {
      setMessage(err.message);
    }
  }

  function startEditingTask(task) {
    setEditingTask(task.id);
    setEditTaskForm({
      title: task.title,
      description: task.description || '',
      assigned_to: task.assigned_to || '',
      due_date: task.due_date || ''
    });
  }

  if (!token) {
    return (
      <div className="container">
        <div className="card">
          <h1>Team Task Manager</h1>
          <p className="small-text">Create projects, assign tasks, and track progress with roles.</p>
          {message && <div className="alert">{message}</div>}
          <div className="grid">
            {mode === 'signup' && (
              <>
                <label>Name</label>
                <input value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} placeholder="Your name" />
              </>
            )}
            <label>Email</label>
            <input value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} placeholder="you@example.com" />
            <label>Password</label>
            <input type="password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} placeholder="Password" />
            <button onClick={mode === 'signup' ? handleSignup : handleLogin}>{mode === 'signup' ? 'Sign up' : 'Log in'}</button>
            <button className="secondary" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(''); }}>
              {mode === 'signup' ? 'Have an account? Login' : 'Create an account'}
            </button>
            <button className="secondary" onClick={() => alert('Team Task Manager\n\nCreate projects, assign tasks, and track progress with roles.\n\nFeatures:\n• User Authentication\n• Project Management\n• Task Assignment\n• Role-based Access Control\n• Team Collaboration')}>
              ℹ️ Info
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div className="section-header">
          <div>
            <h1>Welcome, {user?.name}</h1>
            <p className="small-text">{user?.email} • {user?.role}</p>
          </div>
          <button className="secondary" onClick={handleLogout}>Logout</button>
        </div>
        {message && <div className="alert">{message}</div>}
        <div className="grid grid-3">
          <div className="card">
            <h2>Projects</h2>
            <div>
              {projects.length === 0 && <p>No projects yet. Create one below.</p>}
              {projects.map((project) => (
                <div className="task-card" key={project.id} style={{ cursor: 'pointer' }} onClick={() => fetchProjectDetail(project.id)}>
                  <strong>{project.name}</strong>
                  <p className="small-text">Owner: {project.owner_name}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Create Project</h2>
            <label>Name</label>
            <input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="Project name" />
            <label>Description</label>
            <textarea value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} rows="3" placeholder="Project description" />
            <button onClick={createProject}>Create Project</button>
          </div>
          <div className="card">
            <h2>Dashboard</h2>
            <p><strong>Active projects:</strong> {dashboard.projects.length}</p>
            <p><strong>Overdue tasks:</strong> {dashboard.overdue}</p>
            <div>
              {dashboard.statuses.map((group) => (
                <p key={group.status}>{group.status}: {group.total}</p>
              ))}
            </div>
            <h3>Recent Tasks</h3>
            {dashboard.tasks.length === 0 && <p>No tasks yet.</p>}
            {dashboard.tasks.map((task) => (
              <div className="task-card" key={task.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{task.title}</strong>
                    <p className="small-text">Project: {task.project_name}</p>
                    <p className="small-text">Assigned to: {task.assignee_name || 'Unassigned'}</p>
                    <p className="small-text">Due: {formatDate(task.due_date)}</p>
                  </div>
                  <span className={`status-pill ${statusClass(task.status)}`}>{task.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeProject && (
        <div className="card">
          <div className="section-header">
            <div>
              <h2>{activeProject.name}</h2>
              <p className="small-text">{activeProject.description}</p>
            </div>
            <button className="secondary" onClick={() => setActiveProject(null)}>Hide details</button>
          </div>
          <div className="grid grid-3">
            <div>
              <h3>Members</h3>
              {(activeProject.members || []).map((member) => (
                <div key={member.id} className="task-card">
                  <strong>{member.name}</strong>
                  <p className="small-text">{member.email}</p>
                  <span className="status-pill">{member.role}</span>
                </div>
              ))}
            </div>
            <div>
              <h3>Create Task</h3>
              <label>Title</label>
              <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Task title" />
              <label>Description</label>
              <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows="3" placeholder="Task description" />
              <label>Assign to</label>
              <select value={taskForm.assigned_to} onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}>
                <option value="">Unassigned</option>
                {(activeProject.members || []).map((member) => (
                  <option key={member.id} value={member.id}>{member.name} ({member.email})</option>
                ))}
              </select>
              <label>Due date</label>
              <input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
              <button onClick={createTask}>Create Task</button>
            </div>
            <div>
              <h3>Add Member</h3>
              <label>Email</label>
              <input value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} placeholder="member@example.com" />
              <label>Role</label>
              <select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={addMember}>Invite Member</button>
            </div>
          </div>

          <div className="card">
            <h3>Tasks</h3>
            {(!activeProject.tasks || activeProject.tasks.length === 0) && <p>No tasks for this project yet.</p>}
            {(activeProject.tasks || []).map((task) => (
              <div className="task-card" key={task.id}>
                {editingTask === task.id ? (
                  <div>
                    <label>Title</label>
                    <input value={editTaskForm.title} onChange={(e) => setEditTaskForm({ ...editTaskForm, title: e.target.value })} />
                    <label>Description</label>
                    <textarea value={editTaskForm.description} onChange={(e) => setEditTaskForm({ ...editTaskForm, description: e.target.value })} rows="2" />
                    <label>Assign to</label>
                    <select value={editTaskForm.assigned_to} onChange={(e) => setEditTaskForm({ ...editTaskForm, assigned_to: e.target.value })}>
                      <option value="">Unassigned</option>
                      {(activeProject.members || []).map((member) => (
                        <option key={member.id} value={member.id}>{member.name} ({member.email})</option>
                      ))}
                    </select>
                    <label>Due date</label>
                    <input type="date" value={editTaskForm.due_date} onChange={(e) => setEditTaskForm({ ...editTaskForm, due_date: e.target.value })} />
                    <div style={{ marginTop: '10px' }}>
                      <button onClick={() => updateTask(task.id, editTaskForm)}>Save</button>
                      <button className="secondary" onClick={() => setEditingTask(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{task.title}</strong>
                        <p className="small-text">Assigned to: {task.assignee_name || 'Unassigned'}</p>
                        <p className="small-text">Due: {formatDate(task.due_date)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span className={`status-pill ${statusClass(task.status)}`}>{task.status}</span>
                        <button className="secondary" onClick={() => startEditingTask(task)}>Edit</button>
                      </div>
                    </div>
                    <p>{task.description}</p>
                    <div className="grid" style={{ gridTemplateColumns: '1fr repeat(3, auto)', gap: '10px' }}>
                      {STATUSES.map((statusOption) => (
                        <button key={statusOption} className={statusOption === task.status ? 'secondary' : ''} onClick={() => updateTaskStatus(task.id, statusOption)}>
                          {statusOption}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
