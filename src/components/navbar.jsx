import React, { useState } from 'react'
import { Navbar, Nav, NavDropdown } from 'react-bootstrap'
import { useDispatch, useSelector } from 'react-redux'
import { Redirect, Link } from 'react-router-dom'
import { logoutUser } from '../store/actions/users'
import '../css/navbar.css'

const NavBar = (props) => {
	const [redirectHome, redirectHomeHandler] = useState(false)
	const user = useSelector((state) => state.user)

	const dispatch = useDispatch()

	const RedirectToHomePage = () => {
		fetch(`/logout/${user.username}`, {
			method: 'GET',
		}) //logout user - delete tokens
			.then(() => {
				dispatch(logoutUser())
				redirectHomeHandler(true)
			})
	}

	const handleDeleteUser = () => {
		fetch('/delete/myuser', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				token: user.token,
				username: user.username,
			}),
		})
			.then(RedirectToHomePage())
			.catch((error) => {
				alert(error)
			})
	}

	if (redirectHome) {
		return (
			<Redirect
				to={{
					pathname: '/',
				}}
			/>
		)
	}
	return (
		<>
			<Navbar variant='dark'>
				<Navbar.Brand>Blog-App</Navbar.Brand>
				<Nav className='mr-auto'>
					<Link to='/blog' className='nav-link'>
						Blog
					</Link>
					<Link to='/chat' className='nav-link'>
						Chat
					</Link>
				</Nav>
				<Navbar.Collapse className='justify-content-end'>
					<Navbar.Text>Signed in as:</Navbar.Text>
					<NavDropdown
						title={user.username}
						id='nav-dropdown'
					>
						<NavDropdown.Item>
							<Link to='./updateUser' className='link'>
								Update user
							</Link>
						</NavDropdown.Item>
						<NavDropdown.Item onClick={handleDeleteUser}>
							Delete user
						</NavDropdown.Item>
						<NavDropdown.Item onClick={RedirectToHomePage}>
							Log-out
						</NavDropdown.Item>
					</NavDropdown>
				</Navbar.Collapse>
			</Navbar>
			<br />
		</>
	)
}

export default NavBar
