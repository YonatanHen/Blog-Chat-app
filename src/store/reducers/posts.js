import { GET_POSTS, DELETE_POST } from '../actions/posts'

const initialState = {
    posts: []
}

export default (state = initialState, action) => {
    switch (action.type) {
        case GET_POSTS:
            return {
                ...state,
                posts: action.posts
            }
        case DELETE_POST:
            console.log(state)
            return {
                ...state,
                posts: state.posts.filter(post => post._id !== action.postId)
            }
        default:
            return state
    }
}