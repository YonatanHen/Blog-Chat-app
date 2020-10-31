const express = require('express')
const User = require('../models/user')
const router = new express.Router()

router.get('/login/:username', async (req, res) => {
    const user = await User.findUser( req.params.username )
    res.send(user)
})

router.post('/signin/', async (err,req,res,next) => {
    try {
        await req.user.save()
        res.send()
    } catch (e) {
        req.status(500).send()
    }
})

module.exports = router