const fs = require('fs');
const path = require('path');

const dbPath = 'teamtask.db.json';

// Simple in-memory database
class SimpleDB {
  constructor() {
    this.data = {
      users: [],
      projects: [],
      project_members: [],
      tasks: []
    };
    this.autoIncrement = {
      users: 0,
      projects: 0,
      project_members: 0,
      tasks: 0
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(dbPath)) {
        const content = fs.readFileSync(dbPath, 'utf-8');
        const loaded = JSON.parse(content);
        this.data = loaded.data;
        this.autoIncrement = loaded.autoIncrement;
      }
    } catch (e) {
      console.error('Failed to load database:', e);
    }
  }

  save() {
    try {
      fs.writeFileSync(dbPath, JSON.stringify({ data: this.data, autoIncrement: this.autoIncrement }, null, 2));
    } catch (e) {
      console.error('Failed to save database:', e);
    }
  }

  query(sql, params = []) {
    sql = sql.trim();
    
    if (sql.toUpperCase().startsWith('SELECT')) {
      return this.executeSelect(sql, params);
    } else if (sql.toUpperCase().startsWith('INSERT')) {
      return this.executeInsert(sql, params);
    } else if (sql.toUpperCase().startsWith('UPDATE')) {
      return this.executeUpdate(sql, params);
    } else if (sql.toUpperCase().startsWith('DELETE')) {
      return this.executeDelete(sql, params);
    } else if (sql.toUpperCase().startsWith('CREATE TABLE')) {
      return [];
    } else if (sql.toUpperCase().startsWith('PRAGMA')) {
      return [];
    }
    return [];
  }

  executeSelect(sql, params) {
    // Simple SELECT query executor
    sql = sql.replace(/\?/g, (match) => {
      const param = params.shift();
      if (typeof param === 'string') return `'${param.replace(/'/g, "''")}'`;
      return param;
    });
    
    // Handle COUNT queries (including COUNT(*) and COUNT(1))
    if (sql.toUpperCase().includes('COUNT(')) {
      const countMatch = sql.match(/COUNT\([^)]*\)\s+AS\s+(\w+)/i);
      if (countMatch) {
        const columnName = countMatch[1];
        let tableName = null;
        if (sql.includes('FROM users')) tableName = 'users';
        else if (sql.includes('FROM projects')) tableName = 'projects';
        else if (sql.includes('FROM project_members')) tableName = 'project_members';
        else if (sql.includes('FROM tasks')) tableName = 'tasks';
        
        let count = this.data[tableName] ? this.data[tableName].length : 0;
        
        // Handle WHERE clause for COUNT
        if (sql.includes('WHERE')) {
          const whereMatch = sql.match(/WHERE\s+(.*?)(?:GROUP BY|ORDER BY|$)/i);
          if (whereMatch && tableName) {
            const whereClause = whereMatch[1].trim();
            count = this.data[tableName].filter(row => this.evaluateWhere(row, whereClause)).length;
          }
        }
        
        return [{ [columnName]: count }];
      }
    }
    
    // Extract table name and WHERE clause
    let tableName = null;
    let results = [];
    
    if (sql.includes('FROM users')) tableName = 'users';
    else if (sql.includes('FROM projects')) tableName = 'projects';
    else if (sql.includes('FROM project_members')) tableName = 'project_members';
    else if (sql.includes('FROM tasks')) tableName = 'tasks';
    
    if (tableName) {
      results = [...this.data[tableName]];
      
      // Handle WHERE clause (simplified)
      if (sql.includes('WHERE')) {
        const whereMatch = sql.match(/WHERE\s+(.*?)(?:GROUP BY|ORDER BY|$)/i);
        if (whereMatch) {
          const whereClause = whereMatch[1].trim();
          results = results.filter(row => this.evaluateWhere(row, whereClause));
        }
      }
    }
    
    return results;
  }

  executeInsert(sql, params) {
    const match = sql.match(/INSERT INTO\s+(\w+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)/i);
    if (!match) return { lastInsertRowid: 0 };
    
    const tableName = match[1].toLowerCase();
    const columns = match[2].split(',').map(c => c.trim());
    
    const row = { id: ++this.autoIncrement[tableName] };
    columns.forEach((col, idx) => {
      row[col.toLowerCase()] = params[idx];
    });
    
    // Set default values
    if (tableName === 'users' && !row.created_at) row.created_at = new Date().toISOString();
    if (tableName === 'projects' && !row.created_at) row.created_at = new Date().toISOString();
    if (tableName === 'project_members' && !row.created_at) row.created_at = new Date().toISOString();
    if (tableName === 'tasks') {
      if (!row.created_at) row.created_at = new Date().toISOString();
      if (!row.updated_at) row.updated_at = new Date().toISOString();
      if (!row.status) row.status = 'Pending';
    }
    
    this.data[tableName].push(row);
    this.save();
    return { lastInsertRowid: row.id };
  }

  executeUpdate(sql, params) {
    const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.*?)\s+WHERE\s+(.*?)$/i);
    if (!match) return { changes: 0 };
    
    const tableName = match[1].toLowerCase();
    const updates = match[2];
    const whereClause = match[3];
    
    let changes = 0;
    this.data[tableName].forEach(row => {
      if (this.evaluateWhere(row, whereClause)) {
        const setParts = updates.split(',').map(s => s.trim());
        setParts.forEach(setPart => {
          const [col, val] = setPart.split('=').map(s => s.trim());
          const paramVal = params.shift();
          row[col.toLowerCase()] = paramVal;
        });
        row.updated_at = new Date().toISOString();
        changes++;
      }
    });
    
    this.save();
    return { changes };
  }

  executeDelete(sql, params) {
    const match = sql.match(/DELETE FROM\s+(\w+)\s+WHERE\s+(.*?)$/i);
    if (!match) return { changes: 0 };
    
    const tableName = match[1].toLowerCase();
    const whereClause = match[2];
    
    const initialLen = this.data[tableName].length;
    this.data[tableName] = this.data[tableName].filter(row => !this.evaluateWhere(row, whereClause));
    
    this.save();
    return { changes: initialLen - this.data[tableName].length };
  }

  evaluateWhere(row, whereClause) {
    // Very simple WHERE evaluation
    if (whereClause.includes('=')) {
      const parts = whereClause.split('=').map(s => s.trim());
      const colName = parts[0].split('.').pop().toLowerCase();
      const colVal = parts[1].replace(/'/g, '');
      return row[colName] == colVal;
    }
    return true;
  }
}

const db = new SimpleDB();

// Wrapper that mimics better-sqlite3 API
module.exports = {
  prepare: function(sql) {
    return {
      run: (...params) => {
        const result = db.query(sql, params);
        return result;
      },
      get: (...params) => {
        const results = db.query(sql, params);
        return results[0];
      },
      all: (...params) => {
        return db.query(sql, params);
      }
    };
  },
  exec: function(sql) {
    db.query(sql, []);
  }
};
