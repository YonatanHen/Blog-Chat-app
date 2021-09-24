export const LOGIN_USER = 'LOGIN_USER'
export const LOGOUT_USER = 'LOGOUT_USER'

export const logoutUser = (id) => {
    return dispatch => {
        try {
            dispatch({
                type: LOGOUT_USER,
                userData: { id }
            })
        }

        catch (err) {
            throw new Error('error in logout user!')
        }
    }
}

export const loginUser = (username, id, token) => {
    return dispatch => {
        try {
            dispatch({
                type: LOGIN_USER,
                userData: { username, id, token }
            })
        }

        catch (err) {
            throw new Error('error in login user!')
        }
    }
}