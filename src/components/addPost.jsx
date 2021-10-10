import React from 'react'
import { Container, Form, Button } from 'react-bootstrap'

class AddPost extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            title: '',
            body: ''
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
        fetch('/add-post', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                "token": localStorage.getItem("token"),
                "title": this.state.title,
                "body": this.state.body,
                "author": localStorage.getItem("_id"), //_id value saved in storage when user login/signin
            })
        }) 
        .then(response => response.json())
        .then(response => {
            if(response.status === 400) {
                alert(response.message)
            }
            else if(!response._id) alert(response.message)
            else {
                this.props.history.push({
                    pathname: '/blog',
                })
            }
        })
        .catch((error) => {
            alert("An error occured!")
        })
    }

    render() {
        return (
            <>
                <Container>
                    <h1 className="text-center">Add new post</h1>
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
                    <Button variant="primary"type="submit">Add</Button>
                    </div>
                    </Form>
                </Container>
            </>
        );
   }; 
}

export default AddPost