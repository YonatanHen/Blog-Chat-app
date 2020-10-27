const express = require('express')
require('./db/mongoose')
const path = require('path')
// const cors = require('cors') //cors allow our axios request to go through from the front end to the back end.

const port = process.env.port || 3000
const app = express()

// app.use(cors())
app.use(express.static(path.join(__dirname, '../build')));


app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
})

app.listen(port , (req, res) => {
    console.log('App is listen to port ' + port)
})
