import { LOGIN_USER, LOGOUT_USER } from '../actions/users'

const initialState = {
    username: undefined,
    id: undefined,
    tokens: []
}

export default (state = initialState, action) => {
    switch (action.type) {
        case LOGIN_USER:
            return {
                ...state,
                username: action.userData.username,
                id: action.userData.id,
                tokens: state.tokens.concat(action.userData.tokens),
            }
        case LOGOUT_USER:
            return {
                ...initialState
            }
    }
    return state
}