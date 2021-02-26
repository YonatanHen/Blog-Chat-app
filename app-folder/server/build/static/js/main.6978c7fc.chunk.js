(this["webpackJsonpmy-app"]=this["webpackJsonpmy-app"]||[]).push([[0],{57:function(e,t,a){e.exports=a(71)},70:function(e,t,a){},71:function(e,t,a){"use strict";a.r(t);var n=a(0),r=a.n(n),o=a(22),l=a.n(o),s=a(7),c=a(8),i=a(10),d=a(9),u=a(25),m=a(12),h=a(6),p=a(77),b=a(48),E=a(76),f=a(79),g=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).handleUsername=function(e){n.setState({username:e.target.value})},n.handlePassword=function(e){n.setState({password:e.target.value})},n.handleEmail=function(e){n.setState({email:e.target.value})},n.handleSubmit=function(e){e.preventDefault(),fetch("/signin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:n.state.username,email:n.state.email,password:n.state.password})}).then((function(e){return e.json()})).then((function(e){console.log(e),400===e.status?(console.log(e),alert(e.status)):(sessionStorage.setItem("username",e.username),sessionStorage.setItem("_id",e._id),n.setState({redirect:!0}))})).catch((function(e){console.log(e),alert("An error occured!")}))},n.state={redirect:!1,username:"",password:"",email:""},n.handleUsername=n.handleUsername.bind(Object(h.a)(n)),n.handlePassword=n.handlePassword.bind(Object(h.a)(n)),n.handleEmail=n.handleEmail.bind(Object(h.a)(n)),n.handleSubmit=n.handleSubmit.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return this.state.redirect?r.a.createElement(m.a,{to:{pathname:"/blog"}}):r.a.createElement(E.a,null,r.a.createElement(f.a,{onSubmit:this.handleSubmit},r.a.createElement(f.a.Group,{controlId:"user-username"},r.a.createElement(f.a.Label,null,"Username"),r.a.createElement(f.a.Control,{type:"text",placeholder:"Enter username",value:this.state.username,onChange:this.handleUsername,required:!0})),r.a.createElement(f.a.Group,{controlId:"user-email"},r.a.createElement(f.a.Label,null,"Email address"),r.a.createElement(f.a.Control,{type:"email",placeholder:"Enter email",value:this.state.email,onChange:this.handleEmail,required:!0}),r.a.createElement(f.a.Text,{style:{color:"#55633e"}},"We'll never share your email with anyone else.")),r.a.createElement(f.a.Group,{controlId:"user-password"},r.a.createElement(f.a.Label,null,"Password"),r.a.createElement(f.a.Control,{type:"password",placeholder:"Password",value:this.state.password,onChange:this.handlePassword,required:!0})),r.a.createElement(b.a,{variant:"primary",type:"submit"},"Submit")))}}]),a}(r.a.Component),y=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).handleUsername=function(e){n.setState({username:e.target.value})},n.handlePassword=function(e){n.setState({password:e.target.value})},n.handleSubmit=function(e){e.preventDefault(),fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:n.state.username,password:n.state.password})}).then((function(e){return e.json()})).then((function(e){console.log(e),e.username?(sessionStorage.setItem("username",e.username),sessionStorage.setItem("_id",e.id),n.setState({redirect:!0})):alert("Username/Password are not correct.")})).catch((function(e){alert(e)}))},n.state={redirect:!1,username:"",password:""},n.handleUsername=n.handleUsername.bind(Object(h.a)(n)),n.handlePassword=n.handlePassword.bind(Object(h.a)(n)),n.handleSubmit=n.handleSubmit.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return this.state.redirect?r.a.createElement(m.a,{to:{pathname:"/blog",props:{username:this.state.username}}}):r.a.createElement(E.a,null,r.a.createElement(f.a,{onSubmit:this.handleSubmit},r.a.createElement(f.a.Group,{controlId:"user-username"},r.a.createElement(f.a.Label,null,"Username"),r.a.createElement(f.a.Control,{type:"text",placeholder:"Enter username",value:this.state.username,onChange:this.handleUsername})),r.a.createElement(f.a.Group,{controlId:"user-password"},r.a.createElement(f.a.Label,null,"Password"),r.a.createElement(f.a.Control,{type:"password",placeholder:"Enter Password",value:this.state.password,onChange:this.handlePassword})),r.a.createElement(b.a,{variant:"primary",type:"submit"},"Submit")))}}]),a}(r.a.Component),j=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).onSignInClick=function(){n.setState({showLogIn:!1})},n.onLogInClick=function(){n.setState({showLogIn:!0})},n.state={showLogIn:!0},n.onSignInClick=n.onSignInClick.bind(Object(h.a)(n)),n.onLogInClick=n.onLogInClick.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return r.a.createElement(r.a.Fragment,null,r.a.createElement(p.a,{size:"lg",className:"main-btns","aria-label":"Basic example"},r.a.createElement(b.a,{className:this.state.showLogIn?"active-btn":"",onClick:this.onLogInClick},"Log-In"),r.a.createElement(b.a,{className:this.state.showLogIn?"":"active-btn",onClick:this.onSignInClick},"Sign-In")),this.state.showLogIn?r.a.createElement(y,null):r.a.createElement(g,null))}}]),a}(r.a.Component),v=a(78),O=a(81),S=a(83),C=a(32),w=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).UpdateLikes=function(){n.setState({clicked:!n.state.clicked,totalLikes:n.state.clicked?n.state.totalLikes&&n.state.clicked?n.state.totalLikes-1:n.state.totalLikes:n.state.totalLikes+1}),fetch("/posts/update-likes",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({postID:n.props._id,userID:sessionStorage.getItem("_id"),totalLikes:n.state.totalLikes})}).catch(alert("An error occured!"))},n.state={totalLikes:n.props.totalLikes,clicked:!1},console.log(sessionStorage.getItem("_id")),fetch("/posts/check-like",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userID:sessionStorage.getItem("_id"),postID:n.props._id})}).then((function(e){return e.json()})).then((function(e){n.setState({clicked:e.value}),console.log(n.state.clicked)})).catch((function(e){return alert("An error occured!")})),n.UpdateLikes=n.UpdateLikes.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return r.a.createElement("div",{className:"Like"},r.a.createElement(C.b,{className:this.state.clicked?"clicked-like":"like-btn",onClick:this.UpdateLikes}),r.a.createElement("span",null," ",this.state.totalLikes))}}]),a}(r.a.Component),k=0,T=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).deletePost=function(){fetch("/posts/".concat(n.props._id),{method:"DELETE",headers:{"Content-Type":"application/json"}}).then((function(e){404===e.status||500===e.status?alert(e.statusText):(alert("Post ".concat(n.props.title," deleted successfully.")),window.location.reload(!1))})).catch((function(e){alert(e)}))},n.redirectToUpdatePost=function(){n.setState({redirectToUpdate:!0})},n.userButtons=function(){return sessionStorage.getItem("_id")===n.props.author?r.a.createElement(r.a.Fragment,null,r.a.createElement(b.a,{variant:"secondary",size:"sm",onClick:n.redirectToUpdatePost},"Update Post"),r.a.createElement(b.a,{variant:"danger",size:"sm",onClick:n.deletePost},"Delete Post")):null},n.key=0,n.state={redirectToUpdate:!1},n.userButtons=n.userButtons.bind(Object(h.a)(n)),n.deletePost=n.deletePost.bind(Object(h.a)(n)),n.redirectToUpdatePost=n.redirectToUpdatePost.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return this.state.redirectToUpdate?r.a.createElement(m.a,{to:{pathname:"/updatePost",state:{_id:this.props._id,body:this.props.body,title:this.props.title}}}):r.a.createElement(r.a.Fragment,null,r.a.createElement(S.a,{className:"post-card"},r.a.createElement(S.a.Header,null,r.a.createElement(O.a.Toggle,{className:"post-btn",eventKey:(++k).toString()},this.props.title)),r.a.createElement(O.a.Collapse,{eventKey:k.toString()},r.a.createElement(S.a.Body,null,r.a.createElement("p",null,this.props.body),r.a.createElement("br",null),r.a.createElement("div",{className:"post-sub-btns"},this.userButtons(),r.a.createElement(w,{_id:this.props._id,author:this.props.author,totalLikes:this.props.likes}))))))}}]),a}(r.a.Component),P=a(82),U=a(84),I=a(80),L=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).RedirectToHomePage=function(){fetch("/logout/"+n.state.LoggedUser,{method:"GET"}).then(sessionStorage.removeItem("username"),n.setState({redirectHome:!0}))},n.handleRedirectToUpdateUser=function(){n.setState({redirectToUpdate:!0})},n.handleDeleteUser=function(){fetch("/delete/myuser",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:n.state.LoggedUser})}).then(n.RedirectToHomePage()).catch((function(e){alert(e)}))},n.state={redirectHome:!1,redirectToUpdate:!1,LoggedUser:sessionStorage.getItem("username")},n.handleDeleteUser=n.handleDeleteUser.bind(Object(h.a)(n)),n.RedirectToHomePage=n.RedirectToHomePage.bind(Object(h.a)(n)),n.handleRedirectToUpdateUser=n.handleRedirectToUpdateUser.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return this.state.LoggedUser?this.state.redirectHome?r.a.createElement(m.a,{to:{pathname:"/"}}):this.state.redirectToUpdate?r.a.createElement(m.a,{to:{pathname:"/updateUser"}}):r.a.createElement(r.a.Fragment,null,r.a.createElement(P.a,{variant:"dark"},r.a.createElement(P.a.Brand,{href:"/blog"},"Blog-App"),r.a.createElement(U.a,{className:"mr-auto"}),r.a.createElement(P.a.Collapse,{className:"justify-content-end"},r.a.createElement(P.a.Text,null,"Signed in as:"),r.a.createElement(I.a,{title:this.state.LoggedUser,id:"nav-dropdown"},r.a.createElement(I.a.Item,{onClick:this.handleRedirectToUpdateUser},"Update user"),r.a.createElement(I.a.Item,{onClick:this.handleDeleteUser},"Delete user"),r.a.createElement(I.a.Item,{onClick:this.RedirectToHomePage},"Log-out")))),r.a.createElement("br",null)):r.a.createElement(m.a,{to:{pathname:"/authError"}})}}]),a}(r.a.Component),N=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).redirectToAddPost=function(){n.props.history.push("/addPost")},n.state={posts:null},fetch("/posts/",{method:"GET"}).then((function(e){return e.json()})).then((function(e){console.log(e),n.setState({posts:e}),console.log(n.state.posts)})).catch((function(e){console.log(e),alert("An error occured!")})),n.redirectToAddPost=n.redirectToAddPost.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return this.state.posts?r.a.createElement(r.a.Fragment,null,r.a.createElement(L,null),r.a.createElement(E.a,{className:"text-center"},r.a.createElement(v.a,{fluid:!0},r.a.createElement("h1",null,"Welcome!"),r.a.createElement("p",null,"In this blog you can share with the network everything you want!")),r.a.createElement("br",null),r.a.createElement("br",null),r.a.createElement("div",{className:"d-flex justify-content-center"},r.a.createElement(b.a,{onClick:this.redirectToAddPost},"Add new post"))),this.state.posts.map((function(e){return r.a.createElement(O.a,null,r.a.createElement(T,{_id:e._id,body:e.body,author:e.author,title:e.title,likes:e.likes}))}))):r.a.createElement("div",null,"Loading...")}}]),a}(r.a.Component),x=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(){return Object(s.a)(this,a),t.apply(this,arguments)}return Object(c.a)(a,[{key:"render",value:function(){return r.a.createElement("div",null,r.a.createElement(L,null),r.a.createElement("h2",null,"About"))}}]),a}(r.a.Component),_=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(){return Object(s.a)(this,a),t.apply(this,arguments)}return Object(c.a)(a,[{key:"render",value:function(){return r.a.createElement(r.a.Fragment,null,r.a.createElement(L,null),r.a.createElement("h2",null,"Chat"))}}]),a}(r.a.Component),A=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(){return Object(s.a)(this,a),t.apply(this,arguments)}return Object(c.a)(a,[{key:"render",value:function(){return r.a.createElement("footer",null,r.a.createElement("hr",null),r.a.createElement("div",{className:"footer-elements d-flex justify-content-center"},r.a.createElement("p",null,"Created By: Yehonatan Hen - \xa0"),r.a.createElement("a",{href:"https://www.linkedin.com/in/yehonatan-hen/",target:"_blank",rel:"noopener noreferrer"},r.a.createElement(C.c,{size:"25"})),r.a.createElement("a",{href:"https://github.com/YehonatanHen",target:"_blank",rel:"noopener noreferrer"},r.a.createElement(C.a,{size:"25"}))))}}]),a}(r.a.Component);a(69),a(70);function D(){return r.a.createElement(r.a.Fragment,null,r.a.createElement("h1",null,"You are not authenticated!"),r.a.createElement("a",{href:"/"},"Log-in/Sign-in"))}var B=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).handleTitle=function(e){n.setState({title:e.target.value})},n.handleBody=function(e){n.setState({body:e.target.value})},n.handleSubmit=function(e){e.preventDefault(),fetch("/add-post",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:n.state.title,body:n.state.body,author:sessionStorage.getItem("_id")})}).then((function(e){return e.json()})).then((function(e){console.log(e),400===e.status?alert(e.message):e._id?n.props.history.push({pathname:"/blog"}):alert(e.message)})).catch((function(e){console.log(e),alert("An error occured!")}))},n.state={title:"",body:""},n.handleSubmit=n.handleSubmit.bind(Object(h.a)(n)),n.handleTitle=n.handleTitle.bind(Object(h.a)(n)),n.handleBody=n.handleBody.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return r.a.createElement(r.a.Fragment,null,r.a.createElement(L,null),r.a.createElement(E.a,null,r.a.createElement("h1",{className:"text-center"},"Add new post"),r.a.createElement(f.a,{onSubmit:this.handleSubmit},r.a.createElement(f.a.Group,{controlId:"exampleForm.ControlTextarea1"},r.a.createElement(f.a.Label,null,"Title:"),r.a.createElement(f.a.Control,{as:"textarea",rows:1,value:this.state.title,onChange:this.handleTitle}),r.a.createElement("br",null),r.a.createElement(f.a.Label,null,"body:"),r.a.createElement(f.a.Control,{as:"textarea",rows:5,value:this.state.body,onChange:this.handleBody})),r.a.createElement("br",null),r.a.createElement("div",{className:"d-flex justify-content-center"},r.a.createElement(b.a,{variant:"primary",type:"submit"},"Add")))))}}]),a}(r.a.Component),H=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).handleTitle=function(e){n.setState({title:e.target.value})},n.handleBody=function(e){n.setState({body:e.target.value})},n.handleSubmit=function(e){e.preventDefault(),fetch("/posts/update-post",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:n.state.title,body:n.state.body,postID:n.props.location.state._id})}).then((function(e){return e.json()})).then((function(e){e._id?n.props.history.push({pathname:"/blog"}):alert(e.message)})).catch((function(e){alert("An error occured!"+e)}))},n.state={title:n.props.location.state.title,body:n.props.location.state.body},n.handleSubmit=n.handleSubmit.bind(Object(h.a)(n)),n.handleTitle=n.handleTitle.bind(Object(h.a)(n)),n.handleBody=n.handleBody.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return r.a.createElement(r.a.Fragment,null,r.a.createElement(L,null),r.a.createElement(E.a,null,r.a.createElement("h1",{className:"text-center"},"Update post"),r.a.createElement(f.a,{onSubmit:this.handleSubmit},r.a.createElement(f.a.Group,{controlId:"exampleForm.ControlTextarea1"},r.a.createElement(f.a.Label,null,"Title:"),r.a.createElement(f.a.Control,{as:"textarea",rows:1,value:this.state.title,onChange:this.handleTitle}),r.a.createElement("br",null),r.a.createElement(f.a.Label,null,"body:"),r.a.createElement(f.a.Control,{as:"textarea",rows:5,value:this.state.body,onChange:this.handleBody})),r.a.createElement("br",null),r.a.createElement("div",{className:"d-flex justify-content-center"},r.a.createElement(b.a,{variant:"primary",type:"submit"},"Update")))))}}]),a}(r.a.Component),G=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(e){var n;return Object(s.a)(this,a),(n=t.call(this,e)).handleUsername=function(e){n.setState({username:e.target.value})},n.handlePassword=function(e){n.setState({password:e.target.value})},n.handlePasswordConfirmation=function(e){n.setState({passwordConfirmation:e.target.value})},n.handleEmail=function(e){n.setState({email:e.target.value})},n.handleSubmit=function(e){e.preventDefault(),fetch("/update-user",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userID:sessionStorage.getItem("_id"),username:n.state.username,email:n.state.email,password:n.state.password})}).then((function(e){return e.json()})).then((function(e){console.log(e),400===e.status?(console.log(e),alert(e.status)):n.state.password!==n.state.passwordConfirmation?(alert("Passwords don't match!"),window.location.reload(!1)):(sessionStorage.setItem("username",e.username),n.setState({redirect:!0}))})).catch((function(e){console.log(e),alert("An error occured!")}))},n.state={redirect:!1,username:sessionStorage.getItem("username"),password:"",passwordConfirmation:"",email:""},n.handleUsername=n.handleUsername.bind(Object(h.a)(n)),n.handlePassword=n.handlePassword.bind(Object(h.a)(n)),n.handlePasswordConfirmation=n.handlePasswordConfirmation.bind(Object(h.a)(n)),n.handleEmail=n.handleEmail.bind(Object(h.a)(n)),n.handleSubmit=n.handleSubmit.bind(Object(h.a)(n)),n}return Object(c.a)(a,[{key:"render",value:function(){return this.state.redirect?r.a.createElement(m.a,{to:{pathname:"/blog"}}):r.a.createElement(E.a,null,r.a.createElement("h1",{className:"text-center"},"Update user"),r.a.createElement(f.a,{onSubmit:this.handleSubmit},r.a.createElement(f.a.Group,{controlId:"user-username"},r.a.createElement(f.a.Label,null,"Username"),r.a.createElement(f.a.Control,{type:"text",value:this.state.username,onChange:this.handleUsername})),r.a.createElement(f.a.Group,{controlId:"user-email"},r.a.createElement(f.a.Label,null,"Email address"),r.a.createElement(f.a.Control,{type:"email",value:this.state.email,onChange:this.handleEmail})),r.a.createElement(f.a.Group,{controlId:"user-password"},r.a.createElement(f.a.Label,null,"Password"),r.a.createElement(f.a.Control,{type:"password",value:this.state.password,onChange:this.handlePassword,required:!0}),r.a.createElement(f.a.Label,null,"Confirm password"),r.a.createElement(f.a.Control,{type:"password",value:this.state.passwordConfirmation,onChange:this.handlePasswordConfirmation,required:!0})),r.a.createElement(b.a,{variant:"primary",type:"submit"},"Submit")))}}]),a}(r.a.Component),F=function(e){Object(i.a)(a,e);var t=Object(d.a)(a);function a(){return Object(s.a)(this,a),t.apply(this,arguments)}return Object(c.a)(a,[{key:"render",value:function(){return r.a.createElement("div",{class:"app"},r.a.createElement(u.a,null,r.a.createElement(m.d,null,r.a.createElement(m.b,{exact:!0,path:"/",component:j}),r.a.createElement(m.b,{path:"/blog",component:N}),r.a.createElement(m.b,{path:"/about",component:x}),r.a.createElement(m.b,{path:"/chat",component:_}),r.a.createElement(m.b,{path:"/addPost",component:B}),r.a.createElement(m.b,{path:"/updatePost",component:H}),r.a.createElement(m.b,{path:"/updateUser",component:G}),r.a.createElement(m.b,{path:"/authError",component:D}))),r.a.createElement("div",{className:"gap"},r.a.createElement(A,null)))}}]),a}(r.a.Component);l.a.render(r.a.createElement(F,null),document.getElementById("root"))}},[[57,1,2]]]);
//# sourceMappingURL=main.6978c7fc.chunk.js.map