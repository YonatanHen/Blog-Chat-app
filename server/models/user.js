require('../db/mongoose')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const Post = require('./post')
const jwt = require('jsonwebtoken')

const userSchema = new mongoose.Schema({
	username: {
		type: String,
		required: true,
		trim: true,
	},
	password: {
		type: String,
		required: true,
	},
	email: {
		type: String,
		required: true,
		lowercase: true,
		trim: true,
	},
	tokens: [
		{
			token: {
				type: String,
				require: true,
			},
		},
	],
})

userSchema.virtual('tasks', {
	ref: 'Task',
	localField: '_id', //the field that save the local connection stored data
	foreignField: 'owner', //the field in the other side of the association that connects between them.
})

userSchema.methods.generateAuthToken = async function () {
	const user = this //access to this is more easier with this line
	const token = jwt.sign({ _id: user._id.toString() }, process.env.JWT_SECRET, {
		expiresIn: '1 days',
	})

	user.tokens = user.tokens.concat({ token })
	await user.save()

	return token
}

userSchema.statics.findByUsernameAndPassword = async (username, password) => {
	const user = await User.findOne({ username })
	if (!user) {
		throw new Error('Unable to find user:' + username)
	}

	const isMatch = await bcrypt.compare(password, user.password)
	if (!isMatch) {
		throw new Error('Unable to login')
	}
	return user
}

userSchema.pre('save', async function (next) {
	const user = this

	if (user.isModified('password')) {
		user.password = await bcrypt.hash(user.password, 8)
	}

	next()
})

userSchema.pre('remove', async function (next) {
	const user = this
	await Post.deleteMany({ author: user._id })

	next()
})

const User = mongoose.model('User', userSchema)

module.exports = User
