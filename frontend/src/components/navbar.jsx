import React from 'react';
import { Navbar, Nav} from 'react-bootstrap';

//send to app.js which component is active. 
const NavBar = props =>{
  return ( 
    <>
      <Navbar bg="dark" variant="dark">
        <Navbar.Brand href="/main">Blog-App</Navbar.Brand>
        <Nav className="mr-auto">
          <Nav.Link href="/main">Main</Nav.Link>
          <Nav.Link href="/chat">Chat</Nav.Link>
          <Nav.Link href="/about">About</Nav.Link>
        </Nav>
      </Navbar>
      <br />
    </>
  );
};

export default NavBar