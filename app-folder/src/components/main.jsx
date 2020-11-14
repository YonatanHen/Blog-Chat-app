import React from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import SignIn from './main-components/sign-in'
import LogIn from './main-components/log-in'

class Main extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            showLogIn: true
        }

        this.onSignInClick = this.onSignInClick.bind(this)
        this.onLogInClick = this.onLogInClick.bind(this)
    }

    onSignInClick = () => {
        this.setState({showLogIn: false})
    }

    onLogInClick = () => {
        this.setState({showLogIn: true})
    }

    render() {
        return (
            <>
                <ButtonGroup size="lg" className="main-btns" aria-label="Basic example">
                    <Button style={{backgroundColor:"white", color:"#0284D0"}} onClick={this.onLogInClick}>Log-In</Button>
                    <Button onClick={this.onSignInClick}>Sign-In</Button>
                </ButtonGroup>
                {this.state.showLogIn ? <LogIn /> : <SignIn />}
            </>
        );
    };
};

export default Main