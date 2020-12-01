import React from 'react';
import { Jumbotron, Container, Accordion, Button, InputGroup, FormControl } from 'react-bootstrap';
import Post from './blog-components/post'
import Navbar from './navbar'


class Blog extends React.Component {
   constructor(props) {
       super(props)
       this.state = {
        posts : [] //take from db
       }

       this.add = this.add.bind(this)
   }

   add = () => {
        let posts = this.state.posts 
        posts.push(<Post/>)
        this.setState({
            posts 
        })
   }

    render() {
        return (
            <>
            <Navbar/>
                <Jumbotron fluid>
                    <Container>
                        <h1>Welcome!</h1>
                        <p>
                        In this blog you can share with the media everything you want!
                        </p>
                    </Container>
                </Jumbotron>
                <br/>
                <InputGroup size="sm search">
                    <InputGroup.Prepend>
                    <InputGroup.Text>Search</InputGroup.Text>
                    </InputGroup.Prepend>
                    <FormControl aria-label="Small"/>
                </InputGroup>
                <br />
                <div className='blog-btns'>
                <Button variant="primary" onClick={this.add}>Add new post</Button>
                </div>
                <Accordion>{this.state.posts.map(post => (post))}</Accordion>
            </>
        );
    };
};

export default Blog