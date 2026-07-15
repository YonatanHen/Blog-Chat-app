import React, { useEffect, useState } from 'react'
import { AiFillLike } from 'react-icons/ai'
import { useSelector } from 'react-redux'
import '../../../css/like.css'

const Like = (props) => {
	const [like, setLike] = useState({
		totalLikes: props.totalLikes,
		clicked: false,
	})

	const user = useSelector((state) => state.user)

	useEffect(() => {
		fetch('/posts/check-like', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				userID: user.id,
				postID: props._id,
			}),
		})
			.then((response) => response.json())
			.then((response) => {
				setLike({
                    ...like,
					clicked: response.value,
				})
			})
			.catch((error) => {
                console.log(error)
                alert('An error occured!')})
	}, [])

	const updateLikes = () => {
		setLike({
			clicked: !like.clicked,
			totalLikes: !like.clicked
				? like.totalLikes + 1
				: like.totalLikes && like.clicked
				? like.totalLikes - 1
				: like.totalLikes,
		})

		fetch('/posts/update-likes', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				postID: props._id,
				userID: user.id,
				totalLikes: like.totalLikes,
			}),
		}).catch((error) => {
			console.log(error)
			// alert('An error occured!')
		})
	}

	return (
		<div className='Like'>
			<AiFillLike
				className={!like.clicked ? 'like-btn' : 'clicked-like'}
				onClick={updateLikes}
			/>
			<span> {like.totalLikes}</span>
		</div>
	)
}

export default Like
