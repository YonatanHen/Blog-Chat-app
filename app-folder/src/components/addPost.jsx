import React from 'react'
import { Container, Row, Col, Form, Group, Button } from 'react-bootstrap'
import Navbar from './navbar'

class addPost extends React.Component {
    constructor(props) {
        super(props)
    }
    render() {
        return (
            <>
                <Navbar/>
                <Container>
                    <h1 className="text-center">Add new post</h1>
                    <Form>
                        <Form.Group controlId="exampleForm.ControlTextarea1">
                            <Form.Label>Title:</Form.Label>
                            <Form.Control as="textarea" rows={1} />
                            <br/>
                            <Form.Label>body:</Form.Label>
                            <Form.Control as="textarea" rows={5} />
                        </Form.Group>
                    </Form>
                    <br/>
                    <div className="d-flex justify-content-center">
                    <Button variant="primary" onClick="">Add new post</Button>
                    </div>
                </Container>
            </>
        );
   }; 
}

export default addPost