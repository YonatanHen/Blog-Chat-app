const express = require('express')
const Post = require('../models/post')
const router = new express.Router()

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

router.patch('/like/:postid/:userid', async(req,res) => {
    const userID = req.params.userid
    const postID = req.params.posti
    try {
        await Post.findOne({_id: postID}, function(err,doc) {
            if(!doc.find({likedBy: {$elemMatch: {id: userID}}})) {
                doc.likes.$inc() //incerment likes number
                doc.likedBy.$push(userID)
            }
        })
    } catch (e) {
        res.status(400).send(e)
    }

})

module.exports = router