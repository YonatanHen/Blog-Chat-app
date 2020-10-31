import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Main from './components/main'
import Blog from './components/blog'
import About from './components/about'
import Chat from './components/chat'
import 'bootstrap/dist/css/bootstrap.min.css';
import './css/app.css'

class App extends React.Component {
    render() {
      return (
        <div className="App">
          <Router>
            <div>
              <Switch>
                <Route exact path="/" component={Main} />
                <Route exact path="/blog" component={Blog} />
                <Route path="/about" component={About} />
                <Route path="/chat" component={Chat} />
              </Switch>
            </div>
          </Router>
        </div>
      );
    }
  }
  
  export default App;