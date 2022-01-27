import React, { useEffect, useState} from 'react'
import {
	Jumbotron,
	Container,
	Button,
	InputGroup,
	FormControl,
} from 'react-bootstrap'
import '../css/blog.css'
import '../css/loading.css'
import { Posts } from './blog-components/general-components/postsList'
import * as postsActions from '../store/actions/posts'
import { useDispatch, useSelector } from 'react-redux'

export const Blog = (props) => {
	const posts = useSelector((state) => state.posts.posts)
	const [text, setText] = useState('')
	const [isLoading, setIsLoading] = useState(false)

	const dispatch = useDispatch()

	useEffect(() => {
		setIsLoading(true)
		dispatch(postsActions.getPosts())
		setIsLoading(false)
	}, [dispatch])

	const redirectToAddPost = () => {
		props.history.push('/addPost')
	}

	const handleSearch = (event) => {
		setText(event.target.value)
	}
	return (
		<>
			{!isLoading ? (
				<>
					<Container className='text-center'>
						<Jumbotron fluid>
							<h1>Welcome!</h1>
							<p>
								In this blog you can share with the network everything you want!
							</p>
						</Jumbotron>
						<br />
						<InputGroup size='sm search'>
							<InputGroup.Prepend className='d-flex justify-content-center'>
								<InputGroup.Text>Search</InputGroup.Text>
							</InputGroup.Prepend>
							<FormControl
								aria-label='Small'
								placeholder='Enter text here!'
								onChange={handleSearch}
							/>
						</InputGroup>
						<br />
						<div className='d-flex justify-content-center'>
							<Button onClick={redirectToAddPost}>Add new post</Button>
						</div>
					</Container>
					<Posts postslist={posts} text={text} />
				</>
			) : (
				<div id='loading'>
					Loading
					<br />
					<div className='dot' />
				</div>
			)}
		</>
	)
}

export default Blog
