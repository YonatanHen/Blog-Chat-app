import React from 'react';
import { Card, Accordion, Button } from 'react-bootstrap';
import { Redirect } from 'react-router-dom';
import Like from './post-components/like'
import '../../css/post.css' 

var key = 0

class Post extends React.Component {
    constructor(props) {
        super(props)
        this.key = 0
        this.state = {
            redirectToUpdate: false
        }

        this.userButtons = this.userButtons.bind(this)
        this.deletePost = this.deletePost.bind(this)
        this.redirectToUpdatePost = this.redirectToUpdatePost.bind(this)
    }

    deletePost = () => {
        fetch(`/posts/${this.props._id}`, {
            method: 'DELETE',
            headers: {'Content-Type':'application/json'}
        })
        .then((res) => {
            if( res.status === 404 || res.status === 500) {
                alert(res.statusText)
            }
            else {
                alert(`Post ${this.props.title} deleted successfully.`)
                window.location.reload(false)
            }
        })
        .catch((error) => {
            alert(error)
        })
    }

    redirectToUpdatePost = () => {
        this.setState({
            redirectToUpdate: true
        })
    }

    userButtons = () => {
        if (sessionStorage.getItem('_id') === (this.props.author)) {
            return (
                <>
                    <Button variant="secondary" size="sm" onClick={this.redirectToUpdatePost}>Update Post</Button>
                    <Button variant="danger" size="sm"  onClick={this.deletePost}>Delete Post</Button>
                </>
            )
        }
        return null
    }


    render() {
        if (this.state.redirectToUpdate)
            return (
            <Redirect to={{
                pathname: '/updatePost',
                state: {  
                _id: this.props._id,
                body: this.props.body, 
                title: this.props.title }
            }}/>
            )
        return (
            <>
            <Card className="post-card">
            <Card.Header>
                <Accordion.Toggle className="post-btn" eventKey={(++key).toString()}>
                    <b>{this.props.authorName}</b> { "|" } {this.props.title}
                </Accordion.Toggle>
            </Card.Header>
                <Accordion.Collapse eventKey={(key).toString()}>
                    <Card.Body>
                        <p>
                            {this.props.body}
                        </p>
                        <br/>
                        <div className="post-sub-btns">
                            {this.userButtons()}
                            <Like 
                                _id = {this.props._id}  
                                author = {this.props.author}
                                totalLikes = {this.props.likes}
                            />
                        </div>
                    </Card.Body>
                </Accordion.Collapse>
            </Card>
            </>
        );
    };
 };

 export default Post


