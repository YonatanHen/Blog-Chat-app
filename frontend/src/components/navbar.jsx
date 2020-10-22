import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import { render } from 'react-dom';


//TODO: Change class to active depends on which page directed
//send to app.js which component is active. 
class NavBar extends React.Component {
  render() {
    return ( 
      <nav class="navbar navbar-inverse">
        <div class="container-fluid">
          <div class="navbar-header">
            <a class="navbar-brand" href="#">Blog - App</a>
          </div>
          <ul class="nav navbar-nav">
            <li class="active"><a href="#">Home</a></li>
            <li><a href="/chat">Chat</a></li>
            <li><a href="/about">About</a></li>
          </ul>
        </div>
      </nav>
    );
  };
};

export default NavBar