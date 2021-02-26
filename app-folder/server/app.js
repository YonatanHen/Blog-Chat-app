const express = require('express')
require('./db/mongoose')
const path = require('path')
const cors = require('cors')
const userRouter = require('./routers/user')
const postRouter = require('./routers/post')

const port = process.env.port || 3005
const app = express()

app.use(express.json()) // Parses request body if type is json. Saves to req.body.
app.use(userRouter)
app.use(postRouter)
app.use(cors())


app.use(express.static(path.join(__dirname, 'build')));
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});


app.listen(port , (req, res) => {
    console.log('App is listen to port ' + port)
})
