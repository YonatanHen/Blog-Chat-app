import React from 'react';
import { Card, Accordion, Button } from 'react-bootstrap';
import Like from './post-components/like'
var key = 0

class Post extends React.Component {
    constructor(props) {
        super(props)
        this.key = 0

        this.userButtons = this.userButtons.bind(this)
        this.deletePost = this.deletePost.bind(this)
    }

    deletePost = () => {
        console.log(`/posts/${this.props._id}`)
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

    userButtons = () => {
        if (sessionStorage.getItem('_id') === (this.props.author)) {
            return (
                <>
                    <Button variant="secondary" size="sm">Update Post</Button>
                    <Button variant="danger" size="sm"  onClick={this.deletePost}>Delete Post</Button>
                </>
            )
        }
        return null
    }

    render() {
        return (
            <>
            <Card className="post-card">
            <Card.Header>
                <Accordion.Toggle className="post-btn" eventKey={(++key).toString()}>
                    {this.props.title}
                </Accordion.Toggle>
            </Card.Header>
                <Accordion.Collapse eventKey={(key).toString()}>
                    <Card.Body>
                        <p>
                            {this.props.body}
                        </p>
                        <div className="post-sub-btns">
                            {this.userButtons()}
                            <Like totalLikes ={this.props.likes}/>
                        </div>
                    </Card.Body>
                </Accordion.Collapse>
            </Card>
            </>
        );
    };
 };

 export default Post


