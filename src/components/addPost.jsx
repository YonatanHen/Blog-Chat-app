import React from 'react'
import { useState } from 'react'
import { Container, Form, Button } from 'react-bootstrap'
import { useSelector } from 'react-redux'

const AddPost = (props) => {
	const [post, setPost] = useState({
		title: '',
		body: '',
	})

	const user = useSelector((state) => state.user)

	const handleTitle = (event) => {
		setPost({ ...post, title: event.target.value })
	}

	const handleBody = (event) => {
		setPost({ ...post, body: event.target.value })
	}

	const handleSubmit = (event) => {
		event.preventDefault()
		fetch('/add-post', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				token: user.token,
				title: post.title,
				body: post.body,
				author: user.id, //_id value saved in storage when user login/signin
			}),
		})
			.then((response) => response.json())
			.then((response) => {
				if (response.status === 400) {
					alert(response.message)
				} else if (!response._id) alert(response.message)
				else {
					props.history.push({
						pathname: '/blog',
					})
				}
			})
			.catch((error) => {
				console.log(error)
				alert('An error occured!')
			})
	}

	return (
		<>
			<Container>
				<h1 className='text-center'>Add new post</h1>
				<Form onSubmit={handleSubmit}>
					<Form.Group controlId='exampleForm.ControlTextarea1'>
						<Form.Label>Title:</Form.Label>
						<Form.Control
							as='textarea'
							rows={1}
							value={post.title}
							onChange={handleTitle}
						/>
						<br />
						<Form.Label>body:</Form.Label>
						<Form.Control
							as='textarea'
							rows={5}
							value={post.body}
							onChange={handleBody}
						/>
					</Form.Group>
					<br />
					<div className='d-flex justify-content-center'>
						<Button variant='primary' type='submit'>
							Add
						</Button>
					</div>
				</Form>
			</Container>
		</>
	)
}

export default AddPost
