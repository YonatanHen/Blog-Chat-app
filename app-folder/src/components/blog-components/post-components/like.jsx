import React from 'react';
import { AiFillLike } from 'react-icons/ai';

class Like extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            totalLikes: this.props.totalLikes,
            clicked: false
        }
        
        this.UpdateLikes = this.UpdateLikes.bind(this)
    }
    
    UpdateLikes = () => {
        console.log("dsdsd")
        fetch(`/posts/${this.props._id}/${this.props.author}`, {
            method: 'PATCH',
            headers: {'Content-Type':'application/json'}
        })
    
        this.setState({
            clicked: !this.state.clicked,
            totalLikes: (!this.state.clicked) ? this.state.totalLikes + 1 :  
            (this.state.totalLikes && this.state.clicked) ? this.state.totalLikes - 1 : 
            this.state.totalLikes  
        })  

    }

    render() {
        return (
            <div className="Like">
                <AiFillLike className={!this.state.clicked ? "like-btn" : "clicked-like"} onClick={this.UpdateLikes}/>
                <span> {this.state.totalLikes}</span>
            </div>
        )
    }
}

export default Like