import React, { useState } from 'react';
import { Form, Button, Container } from 'react-bootstrap';
import { Redirect } from 'react-router-dom';

const SignIn = props =>  {
    const [redirect, redirectHandler] = useState(false)
	const [inputValues, setInputValues] = useState({
		username: '',
		password: '',
        email: ''
	})

    const handleOnChange = (event) => {
		const { name, value } = event.target
		setInputValues({ ...inputValues, [name]: value })

	}
    
    
    const handleSubmit = (event) => {
        event.preventDefault()
        fetch('/signin', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                ...inputValues
            })
        })
        .then(response => response.json())
        .then(response => {
            if(response.status === 400) {
                alert(response.message)
            }
            else {
                sessionStorage.setItem("username", response.username)
                sessionStorage.setItem("_id", response.id)              
                redirectHandler(true)
            }
        })
        .catch((error) => {
            console.log(error)
            alert("An error occured!")
        })
    }
    

    if (redirect)
        return (
        <Redirect to={{
            pathname: '/blog',
            props: { username: inputValues.username }
        }}/>
        )
    else return (
        <Container>
            <Form onSubmit={handleSubmit}>
                <Form.Group controlId="user-username">
                    <Form.Label>Username</Form.Label>
                    <Form.Control type="text" placeholder="Enter username" name='username' onChange={handleOnChange} required/>
                </Form.Group>
                <Form.Group controlId="user-email">
                    <Form.Label>Email address</Form.Label>
                    <Form.Control type="email" placeholder="Enter email" name='email' onChange={handleOnChange} required/>
                    <Form.Text style={{color:'#55633e'}}>
                    We'll never share your email with anyone else.
                    </Form.Text>
                </Form.Group>
                <Form.Group controlId="user-password">
                    <Form.Label>Password</Form.Label>
                    <Form.Control type="password" placeholder="Enter password" name='password' onChange={handleOnChange} required/>
                    <Form.Text style={{color:'#55633e'}}>
                    Must include 6 characters
                    </Form.Text>
                </Form.Group>
                <Button variant="primary" type="submit">
                    Submit
                </Button >
            </Form>
        </Container>
    );
};

export default SignIn
