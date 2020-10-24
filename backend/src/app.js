const express = require('express')
require('./db/mongoose')
const cors = require('cors') //cors allow our axios request to go through from the front end to the back end.

const port = process.env.port || 5000
const app = express()

app.use(cors())


app.get('/', (req, res) => {
    res.send({message: 'Done'})
})

app.listen(port , (req, res) => {
    console.log('App is listen to port ' + port)
})
