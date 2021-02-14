const Mongod = require('mongod')
const mongoose = require('mongoose')

mongodbURL = 'mongodb://127.0.0.1:27017/blog-app-api'

mongoose.connect(mongodbURL, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true
})


