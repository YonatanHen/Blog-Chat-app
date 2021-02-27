require('../db/mongoose')
const mongoose = require('mongoose')

const postSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    body: {
        type: String,
    },
    comments: [{
        comment: {
            type: String
        }
    }],
    likes: {
        type: Number,
        default: 0
    },
    likedBy : [{
        id: {
            type: mongoose.Schema.Types.ObjectId,
        }
    }],
    author: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    }
} , {
    timestamps: true
})

const Post = mongoose.model('Post', postSchema)

module.exports = Post