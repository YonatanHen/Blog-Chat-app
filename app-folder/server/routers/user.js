const express = require('express')
const User = require('../models/user')
const router = new express.Router()


router.post('/login', async (req, res) => {
    try {
        const user = await User.findByUsernameAndPassword( req.body.username, req.body.password )
        const token = await user.generateAuthToken()
        res.status(200).send({user , token})
    } catch (e) {
        res.status(404).send()
    }
})

router.post('/signin', async (req,res) => {
    const user = new User(req.body)
    try {
        const username = user.username
        if (await User.findOne({ username })) { //If username doensn't exist.
            throw new Error('username already exsit.')
        }
        await user.save()
        const token = await user.generateAuthToken()
        res.status(201).send({ user , token })
    } catch (e) {
        res.status(400).send(e)
    }
})

router.delete('/delete/myuser', async (req,res) => {
    try {
        const username = req.body.username
        const user = await User.findOne({ username }) 
        if (!user) {
            throw new Error('user does not exist.')
        }
        await user.remove()
        res.status(200).send()
    } catch (e) {
        res.status(400).send(e)
    }
})

module.exports = router