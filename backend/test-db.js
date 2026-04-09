import Database from './database.js'

console.log('Testing database initialization...')

try {
  const db = new Database()
  console.log('Database initialized successfully')

  // Test getting messages
  const messages = db.getMessages('test-thread-id')
  console.log('Messages retrieved:', messages)

} catch (error) {
  console.error('Database error:', error)
  console.error(error.stack)
}