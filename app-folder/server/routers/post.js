const express = require('express')
const Post = require('../models/post')
const router = new express.Router()

router.post('/add-post', async (req,res) => {
    const post = new Post(req.body)
    try {
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
        res.status(404).send(e)
    }

})

router.delete('/posts/:id', async (req,res) => {
    const postId = req.params.id
    try {
        const post = await Post.findOneAndDelete({ _id: postId })    

        if (!post) {
            return res.status(404).send("post not found")

        }

        res.send(post)
    } catch (e) {
        res.status(500).send(e)
    }
})

module.exports = router