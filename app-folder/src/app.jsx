import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Main from './components/main'
import Blog from './components/blog'
import About from './components/about'
import Chat from './components/chat'
import 'bootstrap/dist/css/bootstrap.min.css';
import './css/app.css'
import authError from './components/authError';

class App extends React.Component {
    render() {
      return (
        <div className="App">
          <Router>
              <Switch>
                <Route exact path="/" component={Main}/>
                <Route path="/blog" component={Blog} />
                <Route path="/about" component={About} />
                <Route path="/chat" component={Chat} />
                <Route path='/authError' component={authError} />
              </Switch>
          </Router>
        </div>
      );
    }
  }
  
  export default App;