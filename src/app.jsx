import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Main from './components/main'
import Blog from './components/blog'
import About from './components/about'
import Chat from './components/chat'
import Footer from './components/footer'
import 'bootstrap/dist/css/bootstrap.min.css';
import authError from './components/authError';
import addPost from './components/addPost';
import updatePost from './components/update-components/updatePost';
import UpdateUser from './components/update-components/updateUser';
import './css/app.css'

class App extends React.Component {
    render() {
      return (
        <div class="app">
          <Router>
              <Switch>
                <Route exact path="/" component={Main}/>
                <Route path="/blog" component={Blog} />
                <Route path="/about" component={About} />
                <Route path="/chat" component={Chat} />
                <Route path='/addPost' component={addPost} />
                <Route path='/updatePost' component={updatePost}/>
                <Route path='/updateUser' component={UpdateUser}/>
                <Route path='/authError' component={authError} />
              </Switch>
          </Router>
          <div className="gap">
            <Footer/>
          </div>
        </div>
      );
    }
  }
  
  export default App;