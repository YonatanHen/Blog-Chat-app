//https://stackoverflow.com/questions/32888728/correct-way-to-share-functions-between-components-in-react
//https://stackoverflow.com/questions/30929679/react-fetch-data-in-server-before-render
//https://stackoverflow.com/questions/56861580/how-can-i-redirect-before-render
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