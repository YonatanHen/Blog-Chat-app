// Function check if user can access to the blog (in other words - check if the user logged in).
const checkIfLogin = () => {
    fetch('')
        .then((response) => response.json())
        .then((responseJson) => {
            this.setState({ data : responseJson })
        })
        .catch((error) => {
            console.error(error);
        });
}

module.exports = checkIfLogin