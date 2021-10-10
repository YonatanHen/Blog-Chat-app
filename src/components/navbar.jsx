import React, { useState } from 'react'
import { Navbar, Nav, NavDropdown } from 'react-bootstrap'
import { useSelector, useStore } from 'react-redux'
import { Redirect, Link } from 'react-router-dom'
import '../css/navbar.css'

const NavBar = (props) => {
	const store = useStore()

	const [redirectHome, redirectHomeHandler] = useState(false)
	const LoggedUser = store.getState().username

	const RedirectToHomePage = () => {
		fetch('/logout/' + LoggedUser, {
			method: 'GET',
		}) //logout user - delete tokens
			.then(
				localStorage.removeItem('username'),
				localStorage.removeItem('token'),
				redirectHomeHandler(true)
			)
	}

	// const handleRedirectToUpdateUser = () => {
	// 	redirectToUpdateHandler(true)
	// }

	const handleDeleteUser = () => {
		fetch('/delete/myuser', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				"token": localStorage.getItem("token"),
				username: LoggedUser
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
	// if (redirectHome) {
	// 	return (
	// 		<Redirect
	// 			to={{
	// 				pathname: '/',
	// 			}}
	// 		/>
	// 	)
	// }
	return (
		<>
			{console.log(store.getState())}
			<Navbar variant='dark'>
				<Navbar.Brand>
					Blog-App
				</Navbar.Brand>
				<Nav className='mr-auto'>
					{/* <Nav.Link href="/blog">Blog</Nav.Link>
            <Nav.Link href="/chat">Chat</Nav.Link>
            <Nav.Link href="/about">About</Nav.Link> */}
				</Nav>
				<Navbar.Collapse className='justify-content-end'>
					<Navbar.Text>Signed in as:</Navbar.Text>
					<NavDropdown title={localStorage.getItem('username')} id='nav-dropdown'>
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
