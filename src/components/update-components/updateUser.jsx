import React from 'react';
import { Form, Button, Container } from 'react-bootstrap';
import { Redirect } from 'react-router-dom';


class UpdateUser extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            redirect: false,
            username: sessionStorage.getItem("username"),
            password: '',
            passwordConfirmation: '',
            email: ''
        }

        this.handleUsername = this.handleUsername.bind(this);
        this.handlePassword = this.handlePassword.bind(this);
        this.handlePasswordConfirmation = this.handlePasswordConfirmation.bind(this)
        this.handleEmail = this.handleEmail.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    handleUsername = (event) => {
        this.setState({username: event.target.value});
    }

    handlePassword = (event) => {
        this.setState({password: event.target.value}); 
    }

    handlePasswordConfirmation = (event) => {
        this.setState({passwordConfirmation: event.target.value}); 
    }

    handleEmail = (event) => {
        this.setState({email: event.target.value});
    }
    
    handleSubmit = (event) => {
        event.preventDefault()
        fetch('/update-user', {
            method: 'PATCH',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                "userID": sessionStorage.getItem("_id"), 
                "username": this.state.username,
                "email": this.state.email,
                "password": this.state.password
            })
        })
        .then(response => response.json())
        .then(response => {
            console.log(response)
            if(response.status === 400) {
                console.log(response)
                alert(response.status)
            }
            else if (this.state.password !== this.state.passwordConfirmation) {
                alert("Passwords don't match!")
                window.location.reload(false); //Refreshing page
            }
            else {
                sessionStorage.setItem("username", response.username)              
                this.setState({ redirect: true })
            }
        })
        .catch((error) => {
            console.log(error)
            alert("An error occured!")
        })
    }
    

    render () {
        if (this.state.redirect)
            return (
            <Redirect to={{
                pathname: '/blog',
            }}/>
            )
        else return (
            <Container>
                <h1 className="text-center">Update user</h1>
                <Form onSubmit={this.handleSubmit}>
                    <Form.Group controlId="user-username">
                        <Form.Label>Username</Form.Label>
                        <Form.Control type="text" value={this.state.username} onChange={this.handleUsername} />
                    </Form.Group>
                    <Form.Group controlId="user-email">
                        <Form.Label>Email address</Form.Label>
                        <Form.Control type="email" value={this.state.email} onChange={this.handleEmail} />
                    </Form.Group>
                    <Form.Group controlId="user-password">
                        <Form.Label>Password</Form.Label>
                        <Form.Control type="password" value={this.state.password} onChange={this.handlePassword} required/>
                        <Form.Label>Confirm password</Form.Label>
                        <Form.Control type="password" value={this.state.passwordConfirmation} onChange={this.handlePasswordConfirmation} required/>
                    </Form.Group>
                    <Button variant="primary" type="submit">
                        Submit
                    </Button >
                </Form>
            </Container>
        );
    };
};

export default UpdateUser
