import React from 'react';
import { Jumbotron, Container, Accordion, Button } from 'react-bootstrap';
import Post from './blog-components/post'
import Navbar from './navbar'
import { Redirect } from 'react-router-dom'


class Blog extends React.Component {
   constructor(props) {
       super(props)
       this.state = {
        connectedUser: this.props.location.props.username,
        posts : [],
       }
       // This binding is necessary to make `this` work in the callback
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
                <Navbar username={this.state.connectedUser}/>
                <Jumbotron fluid>
                    <Container>
                        <h1>Welcome!</h1>
                        <p>
                        In this blog you can share with the media everything you want!
                        </p>
                    </Container>
                </Jumbotron>
                <div className='blog-btns'>
                <Button variant="primary" onClick={this.add}>Add new post</Button>
                <Button variant="danger">Secondary</Button>
                </div>
                <Accordion>{this.state.posts.map(post => (post))}</Accordion>
            </>
        );
    };
};

export default Blog