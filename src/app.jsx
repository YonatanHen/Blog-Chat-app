import React from 'react'
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom'
import Main from './components/main'
import Blog from './components/blog'
import About from './components/about'
import Chat from './components/chat'
import Footer from './components/footer'
import 'bootstrap/dist/css/bootstrap.min.css'
import authError from './components/authError'
import AddPost from './components/addPost'
import UpdatePost from './components/update-components/updatePost'
import UpdateUser from './components/update-components/updateUser'
import NavBar from './components/navbar'
import './css/app.css'

class App extends React.Component {
  constructor(props) {
    super(props)
  }

	render() {
		return (
			<div className='app'>
				<Router>
					<Switch>
						<Route exact path='/' component={Main} />
           				<Route path='/authError' component={authError} />
						<>
							<NavBar />
							<Route path='/blog' render={(props) => <Blog {...props}/>} />
							<Route path='/about' render={(props) => <About {...props}/>} />
							{/* <Route path='/chat'  render={() => <Chat />} /> */}
							<Route path='/addPost' render={(props) => <AddPost {...props}/>} />
							<Route path='/updatePost' render={(props) => <UpdatePost {...props}/>} />
							<Route path='/updateUser' render={(props) => <UpdateUser {...props}/>} />
						</>
					</Switch>
				</Router>
				<div className='gap'>
					<Footer />
				</div>
			</div>
		)
	}
}

export default App
