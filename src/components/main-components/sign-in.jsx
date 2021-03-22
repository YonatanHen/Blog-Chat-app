import React from 'react';
import { Form, Button, Container } from 'react-bootstrap';
import { Redirect } from 'react-router-dom';


class SignIn extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            redirect: false,
            username: '',
            password: '',
            email: ''
        }

        this.handleUsername = this.handleUsername.bind(this);
        this.handlePassword = this.handlePassword.bind(this);
        this.handleEmail = this.handleEmail.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    handleUsername = (event) => {
        this.setState({username: event.target.value});
    }

    handlePassword = (event) => {
        this.setState({password: event.target.value}); 
    }

    handleEmail = (event) => {
        this.setState({email: event.target.value});
    }
    
    handleSubmit = (event) => {
        event.preventDefault()
        fetch('/signin', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                "username": this.state.username,
                "email": this.state.email,
                "password": this.state.password
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
                props: { username: this.state.username }
            }}/>
            )
        else return (
            <Container>
                <Form onSubmit={this.handleSubmit}>
                    <Form.Group controlId="user-username">
                        <Form.Label>Username</Form.Label>
                        <Form.Control type="text" placeholder="Enter username" value={this.state.username} onChange={this.handleUsername} required/>
                    </Form.Group>
                    <Form.Group controlId="user-email">
                        <Form.Label>Email address</Form.Label>
                        <Form.Control type="email" placeholder="Enter email" value={this.state.email} onChange={this.handleEmail} required/>
                        <Form.Text style={{color:'#55633e'}}>
                        We'll never share your email with anyone else.
                        </Form.Text>
                    </Form.Group>
                    <Form.Group controlId="user-password">
                        <Form.Label>Password</Form.Label>
                        <Form.Control type="password" placeholder="Enter password" value={this.state.password} onChange={this.handlePassword} required/>
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
};

export default SignIn
