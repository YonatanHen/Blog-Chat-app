import React , { useState } from 'react';
import { AiFillLike } from 'react-icons/ai';

export default function Like () {
    const [totalLikes , setLikes] = useState(0)
    return (
        <div className="Like">
            <AiFillLike className="like-btn" onClick={() => setLikes( totalLikes => totalLikes + 1)}/>
            <span> {totalLikes}</span>
        </div>
    )
}