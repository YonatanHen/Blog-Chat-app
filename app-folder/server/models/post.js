require('../db/mongoose')
const mongoose = require('mongoose')

const postSchema = new mongoose.Schema({
    head: {
        type: String,
        required: true,
        trim: true
    },
    body: {
        type: String,
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    comments: [{
        comment: {
            type: String,
            required: true
        }
    }],
    likes: {
        type: Number,
        default: 0
    }
} , {
    timestamps: true
})

const Post = mongoose.model('Post', userSchema)

module.exports = Post