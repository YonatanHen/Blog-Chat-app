import React from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import SignIn from './sign-in'

class Chat extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            form: undefined //TODO
        }
    }
    render(){
        return (
            <>
                <ButtonGroup size="lg" className="main-btns" aria-label="Basic example">
                    <Button style={{backgroundColor : "white", color:"#0284D0"}}>Log-In</Button>
                    <Button>Sign-In</Button>
                </ButtonGroup>
                <div class="main-form"></div>
                {/* <SignIn /> */}
            </>
        );
    }
}

export default Chat