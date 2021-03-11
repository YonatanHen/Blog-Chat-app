import React from 'react';

class Dots extends React.Component {
    constructor(props){
        super(props)
        this.state = { 
            dots: 1
        }
    }

        componentDidMount() {
            this.interval = setInterval(() => {
              const { dots } = this.state;
              this.setState({ dots: dots === 3 ? 0 : dots + 1 });
            }, 150);
          }
          
          componentWillUnmount() {
            clearInterval(this.interval);
          }
          
          render() {
            const { dots } = this.state;
            let text = dots === 0 ? '' : '.'.repeat(dots);
            return (
              <span>{text}</span>
            );
          }
}

export default Dots