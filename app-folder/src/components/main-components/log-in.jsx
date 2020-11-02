import React from 'react';
import { Form, Button, Container } from 'react-bootstrap';


class LogIn extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
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
        .then(data => {
            if (data.status === 404) alert('User ' + this.state.username + ' not found')
            else alert('OK')
        })
        .catch((error) => {
            alert(error)
        })
    }
    

    render () {
        return (
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

/*value={this.state.email} onChange={this.handleEmail}
value={this.state.password} onChange={this.handlePassword}*/