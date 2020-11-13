import React from 'react';
import { Navbar, Nav} from 'react-bootstrap';
import { Redirect } from 'react-router-dom';

//send to app.js which component is active. 
class NavBar extends React.Component {
  constructor(props) { 
    super(props)
    this.state = {
      LoggedUser: sessionStorage.getItem("username")
    }
  }
  render () {
    if (!this.state.LoggedUser) {
      return (
          <Redirect to={{
            pathname: '/authError',
        }}/>
      )}
    return ( 
      <>
        <Navbar bg="dark" variant="dark">
          <Navbar.Brand href="/blog">Blog-App</Navbar.Brand>
          <Nav className="mr-auto">
            <Nav.Link href="/blog">Blog</Nav.Link>
            <Nav.Link href="/chat">Chat</Nav.Link>
            <Nav.Link href="/about">About</Nav.Link>
          </Nav>
          <Navbar.Collapse className="justify-content-end">
          <Navbar.Text>
            Signed in as: <a href="/#">{this.state.LoggedUser}</a>
          </Navbar.Text>
          </Navbar.Collapse>
        </Navbar>
        <br />
      </>
    );
  };
};

export default NavBar