console.log('Debugging server imports...')

try {
  console.log('1. Importing express...')
  import('express').then(express => {
    console.log('Express loaded')

    console.log('2. Importing cors...')
    import('cors').then(cors => {
      console.log('Cors loaded')

      console.log('3. Importing http...')
      import('http').then(http => {
        console.log('HTTP loaded')

        console.log('4. Importing socket.io...')
        import('socket.io').then(io => {
          console.log('Socket.io loaded')

          console.log('5. Importing database...')
          import('./database.js').then(db => {
            console.log('Database loaded')
            console.log('All imports successful!')
          }).catch(dbError => {
            console.error('Database error:', dbError)
          })
        }).catch(ioError => {
          console.error('Socket.io error:', ioError)
        })
      }).catch(httpError => {
        console.error('HTTP error:', httpError)
      })
    }).catch(corsError => {
      console.error('Cors error:', corsError)
    })
  }).catch(expressError => {
    console.error('Express error:', expressError)
  })
} catch (error) {
  console.error('Global error:', error)
}