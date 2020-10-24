import React from 'react';
import { Form, Button, Container } from 'react-bootstrap';
import Axios from 'axios'

class Login extends React.Component {   
    render () {
        Axios({
            method: "GET",
            url: "http://localhost:5000/",
            headers: {
              "Content-Type": "application/json"
            }
          }).then(res => {
            console.log(res.data.message);
          },{
            method: "GET",
            url: "http://localhost:5000/user",
            headers: {
              "Content-Type": "application/json"
            }
          }).then(res => {
            console.log(res.data.message);
          }
          );
        return (
            <Container>
                <Form>
                    <Form.Group controlId="user-username">
                        <Form.Label>Username</Form.Label>
                        <Form.Control type="text" placeholder="Enter username" />
                    </Form.Group>
                    <Form.Group controlId="user-email">
                        <Form.Label>Email address</Form.Label>
                        <Form.Control type="email" placeholder="Enter email" />
                        <Form.Text className="text-muted">
                        We'll never share your email with anyone else.
                        </Form.Text>
                    </Form.Group>
                    <Form.Group controlId="user-password">
                        <Form.Label>Password</Form.Label>
                        <Form.Control type="password" placeholder="Password" />
                    </Form.Group>
                    <Button variant="primary" type="submit">
                        Submit
                    </Button>
                </Form>
            </Container>
        );
    };
};

export default Login
