import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Main from './components/main'
import About from './components/about'
import Navbar from './components/navbar'

class App extends React.Component {
    render() {
      return (
        <div className="App">
          <Router>
            <div>
              <Navbar />
              <Switch>
                <Route exact path="/" component={Main} />
                <Route path="/about" component={About} />
              </Switch>
            </div>
          </Router>
        </div>
      );
    }
  }
  
  export default App;