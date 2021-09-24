import React from 'react'
import ReactDOM from 'react-dom'
import App from './app'
import { createStore, applyMiddleware } from 'redux';
import { Provider } from 'react-redux'
import usersReducer from './store/reducers/users'
import ReduxThunk from 'redux-thunk'


const store = createStore(usersReducer, applyMiddleware(ReduxThunk));


ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById("root")
);
