const express = require('express')
const User = require('../models/user')
const router = new express.Router()


router.post('/login', async (req, res) => {
    console.log(req.body)
    try {
        const user = await User.findUser( req.body.username, req.user.password)
        console.log(user)
        res.status(200).send(user)
    } catch (e) {
        res.status(404).send()
    }
})

router.post('/signin', async (req,res) => {
        const user = new User(req.body)
        try {
        await user.save()
        res.status(200).send()
    } catch (e) {
        res.status(400).send(e)
    }
})

module.exports = router