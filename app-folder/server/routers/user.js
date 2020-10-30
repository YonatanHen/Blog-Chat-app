const express = require('express')
const User = require('../models/user')
const router = new express.Router()

router.get('/login/:username', async (req, res) => {
    const user = await User.findUser( req.params.username )
    res.send(user)
})

module.exports = router