const Mongod = require('mongod')
const mongoose = require('mongoose')

mongodbURL = 'mongodb://127.0.0.1:27017/blog-app-api'

mongoose.connect(mongodbURL, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true
})

const User = mongoose.model('User', {
    name: String
})


const me = new User({
    name: 'Yoantan'
})

me.save().then(() => {
    console.log(me)
}).catch((err) => {
    console.log(err)
})
//C:\Users\yonat\MongoDB\Server\4.4\bin\mongod.exe --dbpath="C:\Users\yonat\mongodb-data"