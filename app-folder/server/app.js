const express = require('express')
require('./db/mongoose')
const path = require('path')
const cors = require('cors')
const userRouter = require('./routers/user')

const port = process.env.port || 3005
const app = express()

app.use(express.json()) // Parses request body if type is json. Saves to req.body.
app.use(userRouter)
app.use(cors())

app.listen(port , (req, res) => {
    console.log('App is listen to port ' + port)
})
