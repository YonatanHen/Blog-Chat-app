import { FETCH_USER_DATA, LOGIN_USER, LOGOUT_USER } from '../actions/users'

const initialState = {
    username: undefined,
    _id: undefined,
    tokens: []
}

export default (state = initialState, action) => {
    switch (action.type) {
        case LOGIN_USER:
            return {
                ...state,
                username: action.userData.username,
                username: action.userData._id,
                username: action.userData.tokens,
            }
    }

    return state
}