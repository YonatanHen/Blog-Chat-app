import React from 'react'
import ReactDOM from 'react-dom'
import App from './app'
import { createStore, applyMiddleware, combineReducers } from 'redux';
import { Provider } from 'react-redux'
import usersReducer from './store/reducers/users'
import postsReducer from './store/reducers/posts'
import ReduxThunk from 'redux-thunk'

const combinedReducer = combineReducers({
    user: usersReducer,
    posts: postsReducer
})

const store = createStore(combinedReducer, applyMiddleware(ReduxThunk));


ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById("root")
);
