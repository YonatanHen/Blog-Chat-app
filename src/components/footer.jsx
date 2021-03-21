import React from 'react';
import { AiFillGithub, AiFillLinkedin} from 'react-icons/ai';
import '../css/footer.css';

class Footer extends React.Component {
    render() {
        return (
            <footer>
                <hr/>
                <div className="footer-elements d-flex justify-content-center">
                    <p>Created By: Yehonatan Hen - &nbsp;</p>
                    <a href="https://www.linkedin.com/in/yehonatan-hen/" target="_blank" rel="noopener noreferrer"><AiFillLinkedin size="25"/></a>
                    <a href="https://github.com/YehonatanHen" target="_blank" rel="noopener noreferrer"><AiFillGithub size="25"/></a>
                </div>
            </footer>
        )
    }
}

export default Footer