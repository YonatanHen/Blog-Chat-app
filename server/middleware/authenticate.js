
var User = require('./../models/user');

var authenticate = async(req, res, next) => {
    var token = req.body.token

    User.findByToken(token).then((user) => {
        if (!user) {
            return Promise.reject()
        }

        req.user = user
        req.token = token
        next();
    }).catch((e) => {
        console.log(e)
        res.status(401).send() //unauthorized
    });
};

module.exports = authenticate