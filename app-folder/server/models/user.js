require('../db/mongoose')
const mongoose = require('mongoose')


const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    }
})

userSchema.statics.findUser = async (username) => {
    const user = await User.findOne({ username })

    if (!user) {
        return new Error('Unable to find user:' + username)
    }

    return user
}

const User = mongoose.model('User', userSchema)

module.exports = User