import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

class DatabaseManager {
  constructor() {
    this.db = new Database('voicechat.db')
    this.init()
  }

  init() {
    // Providers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Threads table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        provider_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (provider_id) REFERENCES providers (id)
      )
    `)

    // Add new columns if they don't exist (schema migration)
    try {
      this.db.exec(`ALTER TABLE threads ADD COLUMN selected_provider_id TEXT`)
      this.db.exec(`ALTER TABLE threads ADD COLUMN selected_model_id TEXT`)
      this.db.exec(`ALTER TABLE threads ADD FOREIGN KEY (selected_provider_id) REFERENCES providers (id)`)
    } catch (error) {
      // Columns already exist, ignore error
    }

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (thread_id) REFERENCES threads (id)
      )
    `)

    // Settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
  }

  // Provider methods
  getProviders() {
    const stmt = this.db.prepare('SELECT * FROM providers ORDER BY created_at DESC')
    return stmt.all()
  }

  getProvider(id) {
    const stmt = this.db.prepare('SELECT * FROM providers WHERE id = ?')
    return stmt.get(id)
  }

  saveProvider({ name, baseUrl, apiKey }) {
    const id = uuidv4()
    const stmt = this.db.prepare(`
      INSERT INTO providers (id, name, base_url, api_key)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, name, baseUrl, apiKey)
    return this.getProvider(id)
  }

  deleteProvider(id) {
    // Get all threads that reference this provider
    const threadsStmt = this.db.prepare('SELECT id FROM threads WHERE provider_id = ? OR selected_provider_id = ?')
    const threads = threadsStmt.all(id, id)

    // Delete all messages for those threads
    if (threads.length > 0) {
      const threadIds = threads.map(t => t.id)
      const placeholders = threadIds.map(() => '?').join(',')
      const deleteMessagesStmt = this.db.prepare(`DELETE FROM messages WHERE thread_id IN (${placeholders})`)
      deleteMessagesStmt.run(...threadIds)

      // Clear provider references in threads (but keep the threads)
      const clearRefsStmt = this.db.prepare('UPDATE threads SET provider_id = NULL, selected_provider_id = NULL, selected_model_id = NULL WHERE provider_id = ? OR selected_provider_id = ?')
      clearRefsStmt.run(id, id)
    }

    // Now delete the provider
    const stmt = this.db.prepare('DELETE FROM providers WHERE id = ?')
    stmt.run(id)
  }

  // Thread methods
  getThreads() {
    const stmt = this.db.prepare(`
      SELECT t.*, p.name as provider_name
      FROM threads t
      LEFT JOIN providers p ON t.provider_id = p.id
      ORDER BY t.updated_at DESC
    `)
    return stmt.all()
  }

  createThread(title, providerId) {
    const id = uuidv4()
    const stmt = this.db.prepare(`
      INSERT INTO threads (id, title, provider_id, selected_provider_id)
      VALUES (?, ?, ?, ?)
    `)
    // Use NULL instead of empty string for foreign keys
    const providerIdValue = providerId && providerId.trim() ? providerId : null
    stmt.run(id, title, providerIdValue, providerIdValue)
    return this.getThread(id)
  }

  getThread(id) {
    const stmt = this.db.prepare(`
      SELECT t.*, p.name as provider_name, sp.name as selected_provider_name
      FROM threads t
      LEFT JOIN providers p ON t.provider_id = p.id
      LEFT JOIN providers sp ON t.selected_provider_id = sp.id
      WHERE t.id = ?
    `)
    return stmt.get(id)
  }

  updateThread(id, title, selectedProviderId = null, selectedModelId = null) {
    const stmt = this.db.prepare(`
      UPDATE threads
      SET title = ?, selected_provider_id = ?, selected_model_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    stmt.run(title, selectedProviderId, selectedModelId, id)
    return this.getThread(id)
  }

  deleteThread(id) {
    // Delete messages first to avoid foreign key constraint
    const deleteMessagesStmt = this.db.prepare('DELETE FROM messages WHERE thread_id = ?')
    deleteMessagesStmt.run(id)

    // Then delete the thread
    const deleteThreadStmt = this.db.prepare('DELETE FROM threads WHERE id = ?')
    deleteThreadStmt.run(id)
  }

  // Message methods
  getMessages(threadId) {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE thread_id = ?
      ORDER BY created_at ASC
    `)
    return stmt.all(threadId)
  }

  createMessage(threadId, content, role) {
    const id = uuidv4()
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, thread_id, content, role)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(id, threadId, content, role)

    // Update thread timestamp
    this.db.prepare('UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(threadId)

    return this.getMessage(id)
  }

  getMessage(id) {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?')
    return stmt.get(id)
  }

  // Settings methods
  getSetting(key) {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?')
    const result = stmt.get(key)
    return result ? result.value : null
  }

  setSetting(key, value) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value)
      VALUES (?, ?)
    `)
    stmt.run(key, value)
  }
}

export default DatabaseManager