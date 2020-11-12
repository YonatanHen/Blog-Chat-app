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
        if (!await User.findOne({ username })) {
            await user.save()
            const token = await user.generateAuthToken()
            res.status(201).send({ user , token })
            }
        else res.status(404).send()
    } catch (e) {
        res.status(400).send(e)
    }
})

module.exports = router