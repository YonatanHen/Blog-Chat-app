import React, { useState } from 'react'
import { Container, Form, Button } from 'react-bootstrap'
import { useSelector } from 'react-redux'

const UpdatePost = (props) => {
	const [post, setPost] = useState({
		title: props.location.state.title,
		body: props.location.state.body,
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
		fetch('/posts/update-post', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				token: user.token,
				title: post.title,
				body: post.body,
				postID: props.location.state._id,
			}),
		})
			.then((response) => response.json())
			.then((response) => {
				if (!response._id) alert(response.message)
				else {
					props.history.push({
						pathname: '/blog',
					})
				}
			})
			.catch((error) => {
				alert('An error occured!' + error)
			})
	}

	return (
		<>
			<Container>
				<h1 className='text-center'>Update post</h1>
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
							Update
						</Button>
					</div>
				</Form>
			</Container>
		</>
	)
}

export default UpdatePost
