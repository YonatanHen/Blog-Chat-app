import React from 'react';
import { Navbar, Nav, NavDropdown} from 'react-bootstrap';
import { Redirect } from 'react-router-dom';

//send to app.js which component is active. 
class NavBar extends React.Component {
  constructor(props) { 
    super(props)
    this.state = {
      redirectHome: false,
      LoggedUser: sessionStorage.getItem("username")
    }

    this.handleDeleteUser = this.handleDeleteUser.bind(this)
    this.RedirectToHomePage = this.RedirectToHomePage.bind(this)
  }

  RedirectToHomePage = () => {
    fetch('/logout/' + this.state.LoggedUser , {
      method: 'GET'
    }) //logout user - delete tokens
    .then( 
      this.setState({ redirectHome: true })
    )
  }

  handleDeleteUser = () => {
    fetch('/delete/myuser', {
      method: 'DELETE',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ "username": this.state.LoggedUser })
    })
    .then(
      this.RedirectToHomePage()
    )
    .catch((error) => {
      alert(error)
    })
  }

  render () {
    if (!this.state.LoggedUser) {
      return (
          <Redirect to={{
            pathname: '/authError',
        }}/>
      )}
    if (this.state.redirectHome) {
      return (
          <Redirect to={{
            pathname: '/',
        }}/>
      )}
    return ( 
      <>
        <Navbar variant="dark">
          <Navbar.Brand href="/blog">Blog-App</Navbar.Brand>
          <Nav className="mr-auto">
            <Nav.Link href="/blog">Blog</Nav.Link>
            <Nav.Link href="/chat">Chat</Nav.Link>
            <Nav.Link href="/about">About</Nav.Link>
          </Nav>
          <Navbar.Collapse className="justify-content-end">
          <Navbar.Text>
            Signed in as:
          </Navbar.Text>
          <NavDropdown title={this.state.LoggedUser} id="nav-dropdown">
        <NavDropdown.Item eventKey="4.1">Update user</NavDropdown.Item>
        <NavDropdown.Item onClick={this.handleDeleteUser}>Delete user</NavDropdown.Item>
        <NavDropdown.Item onClick={this.RedirectToHomePage}>Log-out</NavDropdown.Item>
        </NavDropdown>
          </Navbar.Collapse>
        </Navbar>
        <br />
      </>
    );
  };
};

export default NavBar