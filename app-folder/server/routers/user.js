const express = require('express')
const User = require('../models/user')
const router = new express.Router()


router.get('/login/:username', async (req, res) => {
    const user = await User.findUser( req.params.username )
    res.send(user)
})

router.post('/signin', async (req,res) => {
    try {
        console.log(req.body.params)
        
        await req.body.save()
        res.send()
    } catch (e) {
        res.status(500).send()
    }
})

module.exports = router