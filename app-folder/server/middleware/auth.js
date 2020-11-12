const jwt = require('jsonwebtoken')
const User = require('../models/user')

const auth = async (req,res,next) => {
    try {
    } catch (e) {
        res.status(401).send({ 'You need to authentice! '})
    }
}