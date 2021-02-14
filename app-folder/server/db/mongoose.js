const Mongod = require('mongod')
const mongoose = require('mongoose')

mongodbURL = 'mongodb+srv://blogapp:***REMOVED-LEAKED-CREDENTIAL***@blog-app-cluster.mw9fr.mongodb.net/test?authSource=admin&replicaSet=atlas-x32usr-shard-0&readPreference=primary&appname=MongoDB%20Compass&ssl=true'

mongoose.connect(mongodbURL, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true
},
() => console.log("Mongoose is connected!"))


