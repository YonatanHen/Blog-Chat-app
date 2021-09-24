const express = require('express')
const User = require('../models/user')
const router = new express.Router()
const validator = require('validator')
const jwt = require('jsonwebtoken')
const authentice = require('../middleware/authenticate')

router.post('/login', async (req, res) => {
	try {
		let user = await User.findByUsernameAndPassword(
			req.body.username,
			req.body.password
		)
		const token = await user.generateAuthToken()
		await user.save()
		res.status(200).send({ id: user._id, username: user.username, token })
	} catch (e) {
		res.status(404).send({ message: e })
	}
})

router.post('/signin', async (req, res) => {
	const user = new User(req.body)
	try {
		if (await User.findOne({ username: user.username })) {
			//If username doensn't exist.
			return res.send({ message: 'username already exists.', status: 400 })
		}
		if (req.body.password.length < 6) {
			return res.send({
				message: 'Password must include 6 characters',
				status: 400,
			})
		}

		const token = await user.generateAuthToken()

		await user.save()
		res.status(201).send({ id: user._id, username: user.username, token })
	} catch (e) {
		res.status(400).send(e)
	}
})

router.get('/logout/:username', async (req, res) => {
	const username = req.params.username
	const user = await User.findOne({ username })
	try {
		user.tokens = []
		await user.save()
		res.status(200).send()
	} catch (e) {
		res.status(500).send()
	}
})

router.delete('/delete/myuser', authentice, async (req, res) => {
	try {
		const username = req.body.username
		const user = await User.findOne({ username }) //username is unique
		if (!user) {
			throw new Error('user does not exist.')
		}
		await user.remove()
		res.status(200).send()
	} catch (e) {
		res.status(400).send(e)
	}
})

router.patch('/update-user', authentice, async (req, res) => {
	try {
		const user = await User.findById(req.body.userID) //username is unique
		if (!user) {
			throw new Error('user does not exist.')
		}

		if (req.body.username !== '') user.username = req.body.username
		if (req.body.password !== user.password) user.password = req.body.password
		if (req.body.email !== '') user.email = req.body.email

		user.save()

		res.status(200).send(user)
	} catch (e) {
		res.status(400).send(e)
	}
})

module.exports = router
