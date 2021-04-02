import React from 'react';
import { Jumbotron, Container ,Button, InputGroup, FormControl } from 'react-bootstrap';
import Navbar from './navbar'
import '../css/blog.css'
import '../css/loading.css'
import Posts from './blog-components/general-components/postsList'

class Blog extends React.Component {
   constructor(props) {
       super(props)
       this.state = {
        posts: null,
        text: ''
       }

       fetch('/posts/', {
        method: 'GET'
    })
    .then(response => response.json())
    .then((data) => {
        this.setState({
            posts: data
        })
    }).catch(error => {
        console.log(error)
        alert("An error occured!")
    })

       this.redirectToAddPost = this.redirectToAddPost.bind(this)
       this.handleSearch = this.handleSearch.bind(this)
   }

   redirectToAddPost = () => {
    this.props.history.push(`/addPost`);
   }

   handleSearch = (event) => {
       this.setState({
           text: event.target.value
       })
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
                    <InputGroup size="sm search">
                        <InputGroup.Prepend className='d-flex justify-content-center'>
                        <InputGroup.Text>Search</InputGroup.Text>
                        </InputGroup.Prepend>
                        <FormControl aria-label="Small" placeholder="Enter text here!" onChange={this.handleSearch}/> 
                    </InputGroup>
                    <br/>
                    <div className='d-flex justify-content-center'>
                    <Button onClick={this.redirectToAddPost}>Add new post</Button>
                    </div>
                </Container>
                <Posts postslist={this.state.posts} text={this.state.text}/>
                 
            </>
        )
        else return (<div id="loading">Loading<br/></div>);
    };
};

export default Blog