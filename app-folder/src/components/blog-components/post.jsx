import React from 'react';
import { Card, Accordion } from 'react-bootstrap';
import Like from './post-components/like'
var key = 0

class Post extends React.Component {
    constructor(props) {
        super(props)
        this.key = 0
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
                        <Like totalLikes ={this.props.likes}/>
                    </Card.Body>
                </Accordion.Collapse>
            </Card>
            </>
        );
    };
 };

 export default Post


