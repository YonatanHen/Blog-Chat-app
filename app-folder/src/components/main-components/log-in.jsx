import React from 'react';
import { Form, Button, Container } from 'react-bootstrap';
import { Redirect } from 'react-router-dom';

class LogIn extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            redirect: false,
            username: 'Yonatan',
            password: '1234',
        }

        this.handleUsername = this.handleUsername.bind(this);
        this.handlePassword = this.handlePassword.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    handleUsername = (event) => {
        this.setState({username: event.target.value});
    }

    handlePassword = (event) => {
        this.setState({password: event.target.value}); 
    }

    handleSubmit = (event) => {
        event.preventDefault()
        fetch('/login', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                "username": this.state.username,
                "password": this.state.password
            })
        })
        .then(response => response.json())
        .then(response => {
            console.log(response)
            if (!response.username) alert('Username/Password are not correct.')
            else {
                sessionStorage.setItem("username", response.username)
                sessionStorage.setItem("_id", response.id)
                this.setState({ redirect: true })
            }
        })
        .catch((error) => {
            alert(error)
        })
    }
    

    render () {
        if (this.state.redirect)
            return (
            <Redirect to={{
                pathname: '/blog',
                props: { username: this.state.username }
            }}/>
            )
        else return (
            <Container>
                <Form onSubmit={this.handleSubmit}>
                    <Form.Group controlId="user-username">
                        <Form.Label>Username</Form.Label>
                        <Form.Control type="text" placeholder="Enter username" value={this.state.username} onChange={this.handleUsername}/>
                    </Form.Group>
                    <Form.Group controlId="user-password">
                        <Form.Label>Password</Form.Label>
                        <Form.Control type="password" placeholder="Password" value={this.state.password} onChange={this.handlePassword}/>
                    </Form.Group>
                    <Button variant="primary" type="submit">
                        Submit
                    </Button >
                </Form>
            </Container>
        );
    };
};

export default LogIn
