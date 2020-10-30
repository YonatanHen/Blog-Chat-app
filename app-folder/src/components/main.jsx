import React from 'react';
import { Jumbotron, Container, Accordion, Button } from 'react-bootstrap';
import Post from './blog-components/post'
import Navbar from './navbar'


class Main extends React.Component {
   constructor(props) {
       super(props)
       this.state = {
       posts : []
       }
       // This binding is necessary to make `this` work in the callback
       this.add = this.add.bind(this)
   }

   add = (e) => {
        let posts = this.state.posts 
        posts.push(<Post/>)
        this.setState({
            posts 
        })
   }

    render() {
        return (
            <>
            <Navbar />
            <Jumbotron fluid>
                <Container>
                    <h1>Fluid jumbotron</h1>
                    <p>
                    This is a modified jumbotron that occupies the entire horizontal space of
                    its parent.
                    </p>
                </Container>
            </Jumbotron>
            <div className='main-btns'>
            <Button variant="primary" onClick={this.add}>Add new post</Button>
            <Button variant="danger">Secondary</Button>
            </div>
            <Accordion>{this.state.posts.map(post => (post))}</Accordion>
            </>
        );
    };
};

export default Main 
