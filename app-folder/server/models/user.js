require('../db/mongoose')
const mongoose = require('mongoose')


const userSchema = new mongoose.Schema({
    username: {
        type: String,
        // required: true,
        // trim: true
    },
    email: {
        type: String,
        // required: true,
        // lowercase: true,
        // trim: true
    },
    password: {
        type: String,
        // required: true
    },
},
{ typeKey: '$type' }
)

userSchema.statics.findUser = async (username) => {
    const user = await User.findOne({ username })

    if (!user) {
        console.log(username)
        return new Error('Unable to find user:' + username)
    }
    console.log(user)
    return user
}

const User = mongoose.model('User', userSchema)

module.exports = User