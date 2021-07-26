export const FETCH_USER_DATA = 'FETCH_USER_DATA'
export const LOGIN_USER = 'LOGIN_USER'
export const LOGOUT_USER = 'LOGOUT_USER'

export const loginUser = (username, _id, tokens) => {
    return dispatch => {
        try {
            dispatch({
                type: LOGIN_USER,
                userData: { username, _id, tokens }
            })
        }

        catch (err) {
            throw new Error('error!')
        }
    }
}