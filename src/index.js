import React from 'react'
import ReactDOM from 'react-dom'
import App from './app'
import { createStore } from 'redux';
import { Provider } from 'react-redux'
import usersReducer from './store/reducers/users'

const store = createStore(usersReducer);


ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById("root")
);
