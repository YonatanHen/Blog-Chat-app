import React from 'react';
import { Jumbotron, Container, Table, Accordion } from 'react-bootstrap';
import Post from './blog-components/post'

class Main extends React.Component {
   constructor(props) {
       super(props)
       this.cards = []
   }
    render() {
        return (
            <>
            <Jumbotron fluid>
                <Container>
                    <h1>Fluid jumbotron</h1>
                    <p>
                    This is a modified jumbotron that occupies the entire horizontal space of
                    its parent.
                    </p>
                </Container>
            </Jumbotron>
            <Accordion><Post/></Accordion>
            </>
        );
    };
};

export default Main 
