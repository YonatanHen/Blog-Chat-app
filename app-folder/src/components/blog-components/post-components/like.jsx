import React from 'react';
import { AiFillLike } from 'react-icons/ai';

class Like extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            totalLikes: 0, //pull this data from DB later
            clicked: false
        }
        
        this.UpdateLikes = this.UpdateLikes.bind(this)
    }
    
    UpdateLikes = () => {
        this.setState({
            count: !this.state.count,
            totalLikes: (!this.state.count) ? this.state.totalLikes + 1 :  
            (this.state.totalLikes && this.state.count) ? this.state.totalLikes - 1 : 
            this.state.totalLikes  
        })    
    }

    render() {
        return (
            <div className="Like">
                <AiFillLike className="like-btn" onClick={this.UpdateLikes}/>
                <span> {this.state.totalLikes}</span>
            </div>
        )
    }
}

export default Like