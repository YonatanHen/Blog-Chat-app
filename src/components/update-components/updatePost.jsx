import React from 'react'
import { Container, Form, Button } from 'react-bootstrap'
import Navbar from '../navbar'

class updatePost extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            title: this.props.location.state.title,
            body: this.props.location.state.body
        }

        this.handleSubmit = this.handleSubmit.bind(this)
        this.handleTitle = this.handleTitle.bind(this)
        this.handleBody = this.handleBody.bind(this)
    }

    handleTitle = (event) => {
        this.setState({title: event.target.value})
    }

    handleBody = (event) => {
        this.setState({body: event.target.value})
    }

    handleSubmit = (event) => {
        event.preventDefault()
        fetch('/posts/update-post', {
            method: 'PATCH',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                "title": this.state.title,
                "body": this.state.body,
                "postID": this.props.location.state._id
            })
        }) 
        .then(response => response.json())
        .then(response => {
            if(!response._id) alert(response.message)
            else {
                this.props.history.push({
                    pathname: '/blog',
                })
            }
        })
        .catch((error) => {
            alert("An error occured!" + error) 
        })
    }

    render() {
        return (
            <>
                <Navbar/>
                <Container>
                    <h1 className="text-center">Update post</h1>
                    <Form onSubmit={this.handleSubmit}>
                        <Form.Group controlId="exampleForm.ControlTextarea1">
                            <Form.Label>Title:</Form.Label>
                            <Form.Control as="textarea" rows={1} value={this.state.title} onChange={this.handleTitle}/>
                            <br/>
                            <Form.Label>body:</Form.Label>
                            <Form.Control as="textarea" rows={5} value={this.state.body} onChange={this.handleBody}/>
                        </Form.Group>
                        <br/>
                    <div className="d-flex justify-content-center">
                    <Button variant="primary"type="submit">Update</Button>
                    </div>
                    </Form>
                </Container>
            </>
        );
   }; 
}

export default updatePost