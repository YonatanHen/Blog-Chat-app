import React from 'react';
import { Card, Accordion, Button } from 'react-bootstrap';


class Post extends React.Component {
    render() {
        return (
            <>
            <Card>
            <Card.Header>
                <Accordion.Toggle as={Button} variant="link" eventKey="0">
                    Click me!
                </Accordion.Toggle>
            </Card.Header>
                <Accordion.Collapse eventKey="0">
                    <Card.Body>Hello! I'm the body</Card.Body>
                </Accordion.Collapse>
            </Card>
            </>
        );
    };
 };

 export default Post


