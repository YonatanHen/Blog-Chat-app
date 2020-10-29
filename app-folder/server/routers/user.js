const express = require('express')
const User = require('../models/user')
const router = new express.Router()

router.get('/login/:username', async (req, res) => {
    const user = await User.findUser({ username: req.params.username })
    return user //Error is handled in user model
})

module.exports = router