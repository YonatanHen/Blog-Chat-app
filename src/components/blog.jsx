import React from 'react';
import { Jumbotron, Container, Accordion, Button } from 'react-bootstrap';
import Post from './blog-components/post'
import Navbar from './navbar'
import Dots from './blog-components/Loading-components/dots'
import '../css/blog.css'
import '../css/loading.css'

class Blog extends React.Component {
   constructor(props) {
       super(props)
       this.state = {
        posts: null
       }

       fetch('/posts/', {
        method: 'GET'
    })
    .then(response => response.json())
    .then((data) => {
        console.log(data)
        this.setState({
            posts: data
        })
        console.log(this.state.posts)
    }).catch(error => {
        console.log(error)
        alert("An error occured!")
    })

       this.redirectToAddPost = this.redirectToAddPost.bind(this)
   }

   redirectToAddPost = () => {
    this.props.history.push(`/addPost`);
   }

    render() {
       if (this.state.posts) return (
            <>
            <Navbar/>
                <Container className="text-center">
                    <Jumbotron fluid>
                            <h1>Welcome!</h1>
                            <p>
                            In this blog you can share with the network everything you want!
                            </p>
                    </Jumbotron>
                    <br/>
                    {/* <InputGroup size="sm search">
                        <InputGroup.Prepend className='d-flex justify-content-center'>
                        <InputGroup.Text>Search</InputGroup.Text>
                        </InputGroup.Prepend>
                        <FormControl aria-label="Small" /> 
                        onKeyUp={this.filteredPosts(Event)} 
                    </InputGroup> */}
                    <br/>
                    <div className='d-flex justify-content-center'>
                    <Button onClick={this.redirectToAddPost}>Add new post</Button>
                    </div>
                </Container>
                    {
                        this.state.posts.map(function (post) {
                            return (
                                <Accordion>
                                    <Post 
                                        _id = {post._id} 
                                        body = {post.body} 
                                        author = {post.author} 
                                        authorName = {post.authorName}
                                        title = {post.title}
                                        likes = {post.likes}
                                    />
                                </Accordion>
                            )
                        })
                    }
            </>
        )
        else return (<div id="loading">Loading<br/><span className="dot"/></div>);
    };
};

export default Blog