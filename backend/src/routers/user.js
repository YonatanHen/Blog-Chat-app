const express = require('express')
const User = require('../models/user')
const router = new express.Router()

router.get('/', async (req, res) => {
    const user = await User.findUser({  })
})

module.exports = router