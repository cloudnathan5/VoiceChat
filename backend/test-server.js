import express from 'express'
import cors from 'cors'

console.log('Testing server setup...')

try {
  const app = express()
  app.use(cors())

  app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!' })
  })

  const PORT = 4001
  app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`)
  })
} catch (error) {
  console.error('Error:', error)
  console.error(error.stack)
}