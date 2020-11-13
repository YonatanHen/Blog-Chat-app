import React from 'react';

export default function authError(){
    return (
        <> 
            <h1>You are not authenticated!</h1>
            <a href='/'>Log-in/Sign-in</a>
        </>
    )
};