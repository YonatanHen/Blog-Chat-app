import React, { useReducer, useState } from 'react'
import { Form, Button, Container } from 'react-bootstrap'
import { Redirect } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'

import * as usersActions from '../../store/actions/users'

const LogIn = (props) => {
	const [redirect, redirectHandler] = useState(false)
	const [inputValues, setInputValues] = useState({
		username: '',
		password: '',
	})

	const handleOnChange = (event) => {
		const { name, value } = event.target
		setInputValues({ ...inputValues, [name]: value })
		// console.log(inputValues)
	}

	const handleSubmit = (event) => {
		console.log(JSON.stringify({...inputValues}))
		event.preventDefault()
		fetch('/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...inputValues,
			}),
		})
			.then((response) => response.json())
			.then((response) => {
				if (!response.username) alert('Username/Password are not correct.')
				else {
					sessionStorage.setItem('username', inputValues.username)
					sessionStorage.setItem('_id', response.id)
					localStorage.getItem('tokens')
						? localStorage.setItem(
								'tokens',
								localStorage.getItem('tokens').concat(response.token)
						  )
						: localStorage.setItem('tokens', [response.token])

					// useDispatch
					redirectHandler(true)
				}
			})
			.catch((error) => {
				alert(error)
			})
	}

	if (redirect)
		return (
			<Redirect
				to={{
					pathname: '/blog',
					props: { username: inputValues.username },
				}}
			/>
		)
	else
		return (
			<Container>
				<Form onSubmit={handleSubmit}>
					<Form.Group controlId='user-username'>
						<Form.Label>Username</Form.Label>
						<Form.Control
							type='text'
							name='username'
							placeholder='Enter username'
							// value={this.state.username}
							onChange={handleOnChange}
							required
						/>
					</Form.Group>
					<Form.Group controlId='user-password'>
						<Form.Label>Password</Form.Label>
						<Form.Control
							type='password'
							name='password'
							placeholder='Enter password'
							// value={this.state.password}
							onChange={handleOnChange}
						/>
					</Form.Group>
					<Button variant='primary' type='submit'>
						Submit
					</Button>
				</Form>
			</Container>
		)
}

export default LogIn
