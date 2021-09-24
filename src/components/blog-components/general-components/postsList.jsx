import React from 'react';
import { Accordion } from 'react-bootstrap';
import Post from '../../blog-components/post'
import '../../../css/blog.css'

class Posts extends React.Component {

    render() {
        return (
            <>
                   {
                        this.props.postslist.filter((post) => post.title.includes(this.props.text) || 
                        post.body.includes(this.props.text))
                            .map((post) => {
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
    }
}

export default Posts