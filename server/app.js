const express = require('express')
require('./db/mongoose')
const path = require('path')
const cors = require('cors')
const userRouter = require('./routers/user')
const postRouter = require('./routers/post')
const http = require('http')
const socketio = require('socket.io')
const Filter = require('bad-words')

const port = process.env.PORT || 3005 ///
const app = express()
const server = http.createServer(app)
const io = socketio(server)

app.use(express.json()) // Parses request body if type is json. Saves to req.body.
app.use(userRouter)
app.use(postRouter)
app.use(cors())

app.use(express.static(path.join(__dirname, 'build')));

app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

io.on("connection", (socket) => {
  console.log("New webSocket connection");

  socket.emit('message', {
    text: 'Welcome!',
    createdAt: new Date().getTime()
  })
  socket.broadcast.emit('message', 'A new user has joined!')

  socket.on('sendMessage', (message, callback) => {
    const filter = new Filter()

    if (filter.isProfane(message)) {
      return callback('Profanity is not allowed!')
    }

    io.emit('message', {
      text: message,
      createdAt: new Date().getTime()
    })
    callback()
  })

  socket.on('disconnect', () => {
    io.emit('message', 'A user has left')
  })

});


server.listen(port , (req, res) => {
    console.log('App is listen to port ' + port)
})
