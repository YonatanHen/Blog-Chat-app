export const GET_POSTS = 'GET_POSTS'
export const DELETE_POST = 'DELETE_POST'

export const getPosts = () => {
    let posts = []
    return async dispatch => {
        await fetch('/posts/', {
            method: 'GET',
        })
            .then((response) => response.json())
            .then((result) => {
                posts = result
            })
            .catch((error) => {
                alert('An error occured!')
            })

        await dispatch({ posts: posts, type: GET_POSTS })
    }
}

export const deletePost = (postId, postTitle) => {
    return async dispatch => {
        await fetch(`/posts/${postId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "token": localStorage.getItem("token")
            })
        })
            .then((res) => {
                if (res.status === 404 || res.status === 500) {
                    alert(res.statusText)
                }
                else {
                    alert(`Post ${postTitle} deleted successfully.`)
                }
            })
            .catch((error) => {
                alert(error)
            })

        await dispatch({ postId: postId, type: DELETE_POST })
    }
}