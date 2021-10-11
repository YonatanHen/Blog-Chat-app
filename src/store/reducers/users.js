import { LOGIN_USER, LOGOUT_USER } from '../actions/users'

const initialState = {
    username: undefined,
    id: undefined,
    token: undefined
}

export default (state = initialState, action) => {
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