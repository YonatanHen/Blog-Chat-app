const Mongod = require('mongod')
const mongoose = require('mongoose')
const User = require('../models/user')

mongodbURL = 'mongodb://127.0.0.1:27017/blog-app-api'

mongoose.connect(mongodbURL, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true
})

//C:\Users\yonat\MongoDB\Server\4.4\bin\mongod.exe --dbpath="C:\Users\yonat\mongodb-data"
