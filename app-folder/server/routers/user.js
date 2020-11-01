const express = require('express')
const User = require('../models/user')
const router = new express.Router()


router.get('/login/:username', async (req, res) => {
    const user = await User.findUser( req.params.username )
    res.send(user)
})

router.post('/signin', async (req,res) => {
        const user = new User(req.body)
        try {
        await user.save()
        res.status(200).send()
    } catch (e) {
        res.status(400).send()
    }
})

module.exports = router