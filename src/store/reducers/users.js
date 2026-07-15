import { LOGIN_USER, LOGOUT_USER } from '../actions/users'

const initialState = {
    username: localStorage.getItem('username') || '',
    id: localStorage.getItem('_id') || '',
    token: localStorage.getItem('token') || ''
}

const usersReducer = (state = initialState, action) => {
    switch (action.type) {
        case LOGIN_USER:
            return {
                ...state,
                username: action.userData.username,
                id: action.userData.id,
                token: action.userData.token,
            }
        case LOGOUT_USER:
            return {
                ...initialState
            }
        default:
            return state
    }
}

export default usersReducer