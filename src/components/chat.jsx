import React, { useState, useEffect } from 'react'
import { Form, InputGroup, FormControl, Button } from 'react-bootstrap'
import socketIOClient from 'socket.io-client'
import moment from 'moment'
import { useSelector } from 'react-redux'

const socket = socketIOClient()

const Chat = () => {
	const user = useSelector((state) => state.user)
	const [message, setMessage] = useState('')
	const [messages, setMessages] = useState([])

	const sendMessageHandler = (event) => {
		event.preventDefault()
		socket.emit('sendMessage', message, (error) => {
			if (error) {
				alert(error)
			} else {
				console.log('Message delivered!')
			}
		})

		setMessage('')
	}

	useEffect(() => {
		socket.on('message', (message) => {
			console.log(message)
			setMessages(messages.concat(message))
		})
	}, [messages])

	return (
		<>
			<h2>Chat</h2>
			<div id='messages'>
				{messages.map((msg) => {
					return (
						<div key={msg}>
							<p>{moment(msg.createdAt).format('h:mm A')} - {msg.text}</p>
						</div>
					)
				})}
			</div>
			<Form onSubmit={sendMessageHandler}>
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
		</>
	)
}

export default Chat
