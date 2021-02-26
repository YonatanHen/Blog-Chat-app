const express = require('express')
const User = require('../models/user')
const router = new express.Router()


router.post('/login', async (req, res) => {
    try {
        const user = await User.findByUsernameAndPassword(req.body.username, req.body.password )
        const token = await user.generateAuthToken()
        res.status(200).send({id: user._id, username: user.username , token })
    } catch (e) {
        res.status(404).send({messgae : e})
    }
})

router.post('/signin', async (req,res) => {
    const user = new User(req.body)
    try {
        if (await User.findOne({ username: user.username })) { //If username doensn't exist.
            return res.send({message:"username already exists.", status: 400})
        }
        await user.save()
        const token = await user.generateAuthToken()
        res.status(201).send({id: user._id, username: user.username , token })
    } catch (e) {
        res.status(400).send(e)
    }
})

router.get('/logout/:username', async (req,res) => {
    const username = req.params.username
    const user = await User.findOne({ username })
    try {
        user.tokens = []
        await user.save()
        res.status(200).send()
    } catch (e) {
        res.status(500).send()
    }
})

router.delete('/delete/myuser', async (req,res) => {
    try {
        const username = req.body.username
        const user = await User.findOne({ username }) //username is unique
        if (!user) {
            throw new Error('user does not exist.')
        }
        await user.remove()
        res.status(200).send()
    } catch (e) {
        res.status(400).send(e)
    }
})

router.patch('/update-user' , async (req,res) => {
    try {
    const user = await User.findById(req.body.userID) //username is unique
    if (!user) {
        throw new Error('user does not exist.')
    }
    
    if(req.body.username !== '') user.username = req.body.username
    if(req.body.password !== user.password) user.password = req.body.password
    if(req.body.email !== '') user.email = req.body.email

    user.save()

    res.status(200).send(user)
    } catch (e) {
    res.status(400).send(e)
    }
})

module.exports = router