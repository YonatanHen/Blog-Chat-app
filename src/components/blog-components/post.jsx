import React, { useState } from 'react'
import { Card, Accordion, Button } from 'react-bootstrap'
import { Redirect } from 'react-router-dom'
import Like from './post-components/like'
import '../../css/post.css'
import * as postsActions from '../../store/actions/posts'
import { useDispatch, useSelector } from 'react-redux'

export const Post = (props) => {
	let key = 0
	const [redirectToUpdate, redirectToUpdateHandler] = useState(false)
	const user = useSelector(state => state.user)

	const dispatch = useDispatch()

	const userButtons = () => {
		if (user.id === props.author) {
			return (
				<>
					<Button
						variant='secondary'
						size='sm'
						onClick={() => redirectToUpdateHandler(true)}
					>
						Update Post
					</Button>
					<Button
						variant='danger'
						size='sm'
						onClick={() => dispatch(postsActions.deletePost(props._id, props.title))}
					>
						Delete Post
					</Button>
				</>
			)
		}
		return null
	}

	if (redirectToUpdate)
		return (
			<Redirect
				to={{
					pathname: '/updatePost',
					state: {
						_id: props._id,
						body: props.body,
						title: props.title,
					},
				}}
			/>
		)
	return (
		<>
			<Card className='post-card'>
				<Card.Header>
					<Accordion.Toggle className='post-btn' eventKey={(++key).toString()}>
						<b>{props.authorName}</b> {'|'} {props.title}
					</Accordion.Toggle>
				</Card.Header>
				<Accordion.Collapse eventKey={key.toString()}>
					<Card.Body>
						<p>{props.body}</p>
						<br />
						<div className='post-sub-btns'>
							{userButtons()}
							<Like
								_id={props._id}
								author={props.author}
								totalLikes={props.likes}
							/>
						</div>
					</Card.Body>
				</Accordion.Collapse>
			</Card>
		</>
	)
}
