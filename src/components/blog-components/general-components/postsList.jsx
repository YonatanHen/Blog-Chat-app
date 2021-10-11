import React from 'react'
import { Accordion } from 'react-bootstrap'
import { Post } from '../../blog-components/post'
import '../../../css/blog.css'

export const Posts = (props) => {
	return (
		<>
			{props.postslist
				.filter(
					(post) =>
						post.title.includes(props.text) || post.body.includes(props.text)
				)
				.map((post) => {
					return (
						<Accordion>
							<Post
								_id={post._id}
								body={post.body}
								author={post.author}
								authorName={post.authorName}
								title={post.title}
								likes={post.likes}
							/>
						</Accordion>
					)
				})}
		</>
	)
}
