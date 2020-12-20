import React from 'react';
import { Card, Accordion, Button } from 'react-bootstrap';
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
                <Accordion.Toggle as={Button} variant="link" eventKey={(++key).toString()}>
                    Click me!
                </Accordion.Toggle>
            </Card.Header>
                <Accordion.Collapse eventKey={(key).toString()}>
                    <Card.Body>
                        <p>
                            body
                        </p>
                        <Like />
                    </Card.Body>
                </Accordion.Collapse>
            </Card>
            </>
        );
    };
 };

 export default Post


