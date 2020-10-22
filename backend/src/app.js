const express = require('express')
const path = require('path')

const port = process.env.port || 3000
const app = express()

app.use(express.static(path.join(__dirname, '../build')))

app.get('/main', (req,res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'))
})

app.get('/about', (req, res) => {
    res.send('About page')
})

app.get('/chat', (req, res) => {
    res.send('chat page')
})


app.listen(port , (req,res) => {
    console.log('App is listen to port ' + port)
})
