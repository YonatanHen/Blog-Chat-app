import React from 'react';
import { AiFillLike } from 'react-icons/ai';

class Like extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            totalLikes: this.props.totalLikes,
            clicked: false
        }
        console.log(sessionStorage.getItem("_id"))
        fetch('/posts/check-like', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                "userID": sessionStorage.getItem("_id"),
                "postID": this.props._id,
            })
        })
        .then(response => response.json())
        .then(response => {
            this.setState({
                clicked: response.value
            })
            console.log(this.state.clicked)
        })
        .catch(error => alert("An error occured!"))

        this.UpdateLikes = this.UpdateLikes.bind(this)
    }

    UpdateLikes = () => {
        this.setState({
            clicked: !this.state.clicked,
            totalLikes: (!this.state.clicked) ? this.state.totalLikes + 1 :  
            (this.state.totalLikes && this.state.clicked) ? this.state.totalLikes - 1 : 
            this.state.totalLikes  
        })
        
        fetch('/posts/update-likes', {
            method: 'PATCH',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                "postID": this.props._id,
                "userID": sessionStorage.getItem("_id"),
                "totalLikes": this.state.totalLikes
            })
        })
        .catch(alert("An error occured!"))
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