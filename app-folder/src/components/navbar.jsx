import React from 'react';
import { Navbar, Nav} from 'react-bootstrap';

//send to app.js which component is active. 
class NavBar extends React.Component {
  constructor(props) { 
    super(props)
    this.state = {
      LoggedUser: localStorage.getItem("username")
    }
  }
  render () {
    return ( 
      <>
        <Navbar bg="dark" variant="dark">
          <Navbar.Brand href="/main">Blog-App</Navbar.Brand>
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