const express = require('express')
require('./db/mongoose')
const path = require('path')
const cors = require('cors')
const userRouter = require('./routers/user')

const port = process.env.port || 3005
const app = express()

app.use(express.static(path.join(__dirname, '../build')));
app.use(userRouter)
app.use(cors())

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
})

app.listen(port , (req, res) => {
    console.log('App is listen to port ' + port)
})
