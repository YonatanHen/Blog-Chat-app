const express = require('express')
const Post = require('../models/post')
const router = new express.Router()
const mongoose = require('mongoose')

router.post('/add-post', async (req,res) => {
    const post = new Post(req.body)
    try {
        if (await Post.findOne({title: post.title})) {
            return res.status(400).send({message: "There is a post with the same title, please choose another one.", status: 400})
        }
        await post.save()
        res.status(201).send(post)
    } catch (e) {
        res.status(400).send(e)
    }
})

router.get('/posts', async(req,res) => {
    try {
        const posts = await Post.find()
        if (posts == []) return res.status(204).send() //204 = data is empty
        res.status(200).send(posts)
    } catch (e) {
        res.status(404).send({e})
    }

})

// router.patch('/posts/update-post', {
//     const post = Post.findOne()
// })

router.delete('/posts/:id', async (req,res) => {
    const postId = req.params.id
    try {
        const post = await Post.findOneAndDelete({ _id: postId })    

        if (!post) {
            return res.status(404).send({message:"post not found"})
        }

        res.send(post)
    } catch (e) {
        res.status(500).send({message: e})
    }
})

router.post('/posts/check-like', async(req,res) => {
    const post = await Post.findById(req.body.postID)
    console.log(req.body.userID)
    console.log(post.likedBy)
    try {
        if(post.likedBy.some(id => id._id.equals(req.body.userID))) { //https://stackoverflow.com/questions/19737408/mongoose-check-if-objectid-exists-in-an-array
            return res.send({value: true})
        }

        res.send({value: false})
    } catch (e) {
        res.status(400).send(e)
    }
})

router.patch('/posts/update-likes', async(req,res) => {
    const userID = req.body.userID
    const postID = req.body.postID
    const totalLikes = req.body.totalLikes
    
    try {
            const post = await Post.findById(postID)
            
            if(!post.likedBy.some(id => id._id.equals(userID))) {
                await post.likedBy.push(userID)
            } else {
               post.likedBy = await post.likedBy.filter(id => !id._id.equals(userID))
                
            }
            console.log(userID)
            console.log(post.likedBy)
            post.likes = post.likedBy.length

            await post.save()
            res.send(post)
        } catch (e) {
        res.status(400).send(e)
    }
})

module.exports = router