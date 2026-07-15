import React, { useState, useEffect } from 'react'
import '../css/chat.css'
import {
	Form,
	InputGroup,
	FormControl,
	Button,
	Container,
} from 'react-bootstrap'
import socketIOClient from 'socket.io-client'
import moment from 'moment'
import { useSelector } from 'react-redux'
import { Prompt } from 'react-router-dom'

const socket = socketIOClient()

let key = 0

const Chat = () => {
	const user = useSelector((state) => state.user)
	const [message, setMessage] = useState('')
	const [messages, setMessages] = useState([])

	const sendMessageHandler = (event) => {
		event.preventDefault()
		socket.emit(
			'sendMessage',
			{ message: message, user: user.username },
			(error) => {
				if (error) {
					alert(error)
				} else {
					console.log('Message delivered!')
				}
			}
		)

		setMessage('')
	}

	useEffect(() => {
		socket.emit('join', { user: user.username }, (error) => {
			if (error) {
				alert(error)
			} else {
				console.log('Message delivered!')
			}
		})
	}, [])

	useEffect(() => {
		socket.on('message', (message) => {
			setMessages(messages.concat(message))
		})
	}, [messages])

	useEffect(() => {
		socket.emit('disconnect', { user: user.username }, (error) => {
			if (error) {
				alert(error)
			} else {
				console.log('Message delivered!')
			}
		})
	})

	return (
		<div className='chat'>
			<div className='messages'>
				{messages.map((msg) => {
					key++
					return (
						<div key={key} className='message-box'>
							{console.log(msg)}
							<h6>
								{msg.user ? `${msg.user} -` : ''}{' '}
								{moment(msg.createdAt).format('HH:mm A')}
							</h6>
							<p> {msg.text}</p>
						</div>
					)
				})}
			</div>
			<Form onSubmit={sendMessageHandler} className='message-input'>
				<InputGroup>
					<FormControl
						placeholder='Type your message...'
						value={message}
						onChange={(text) => setMessage(text.target.value)}
					/>
					<Button variant='secondary' type='submit'>
						Send
					</Button>
				</InputGroup>
			</Form>
		</div>
	)
}

export default Chat
