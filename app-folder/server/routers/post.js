const express = require('express')
const Post = require('../models/post')
const router = new express.Router()

router.post('/add-post', async (req,res) => {
    //Add new post to db
})