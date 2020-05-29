const express = require('express'),
  app = express(),
  server = require('http').createServer(app),
  io = require('socket.io').listen(server),
  PORT= process.env.PORT || 2000,
  users = [],
  idles = [];
const log =require('./log');

let kit = {
  // check whether the user is online
  isHaveUser(user) {
    let flag = false;
    users.forEach(function (item) {
      if (item.name == user.name) {
        flag = true;
      }
    })
    return flag;
  },
  // delete a user
  delUser(id) {
    users.forEach(function (item, index) {
      if (item.id == id) {
        users.splice(index, 1);
      }
    })
  },
  getDeviceType(userAgent){
    let bIsIpad = userAgent.match(/ipad/i) == "ipad";
    let bIsIphoneOs = userAgent.match(/iphone os/i) == "iphone os";
    let bIsMidp = userAgent.match(/midp/i) == "midp";
    let bIsUc7 = userAgent.match(/rv:1.2.3.4/i) == "rv:1.2.3.4";
    let bIsUc = userAgent.match(/ucweb/i) == "ucweb";
    let bIsAndroid = userAgent.match(/android/i) == "android";
    let bIsCE = userAgent.match(/windows ce/i) == "windows ce";
    let bIsWM = userAgent.match(/windows mobile/i) == "windows mobile";
    if (bIsIpad || bIsIphoneOs || bIsMidp || bIsUc7 || bIsUc || bIsAndroid || bIsCE || bIsWM) {
      return "touch";
    } else {
      return "pc";
    }
  }
}

// Setting static 
app.use('/static', express.static(__dirname + '/static'));
app.get("/", (req, res) => {  
  let path = __dirname + '/static/index.html';
  res.sendFile(path);
})

io.sockets.on('connection',(socket)=>{
  // Create connection 
  socket.on('login', (user)=> {
    if (kit.isHaveUser(user)) {
      console.log("Login failed, nickname <"+user.name+"> has been used. ")
      socket.emit('loginFail', "Login failed, nickname has been used. ");
    } else {
      user.id = socket.id;
      user.roomId=socket.id;
      user.address = socket.handshake.address.replace(/::ffff:/,"");
      let userAgent=socket.handshake.headers["user-agent"].toLowerCase();
      let deviceType=kit.getDeviceType(userAgent);
      user.deviceType=deviceType;
      user.loginTime=new Date().getTime();
      socket.user = user;
	  if (idles.length == 0) {
		  socket.emit('loginSuccess', user, users, null);
		  idles.push(user);
	  }
      else {
		  const randomElement = idles[Math.floor(Math.random() * idles.length)];
		  socket.emit('loginSuccess', user, users, randomElement);
		  socket.broadcast.to(randomElement.roomId).emit('pair', user);
		  const index = idles.indexOf(randomElement);
		  if (index > -1) {
		      idles.splice(index, 1);
		  }
		  log.logUserMessage(user, randomElement, "Pair Up");
	  }
      users.push(user);
      socket.broadcast.emit('system', user, 'join');
      log.logLoginMessage(user,'join');
    }
  });
  
  // Find new pair
  socket.on('pairup', ()=> {
	  // Check whether a user is still online
	  if (!socket.user) {
        from.roomId = socket.id;
        socket.user = from;
        users.push(from);
        socket.broadcast.emit('system', from, 'join');
        socket.emit('loginSuccess', from, []);
      }
	  if (idles.length != 0) {
		  const randomElement = idles[Math.floor(Math.random() * idles.length)];
		  socket.broadcast.to(randomElement.roomId).emit('pair', socket.user);
		  socket.emit('pair', randomElement);
		  const index = idles.indexOf(randomElement);
		  if (index > -1) {
			  idles.splice(index, 1);
		  }
		  log.logUserMessage(socket.user, randomElement, "Pair Up");	  
	  }
	  else {
		  idles.push(socket.user);
	  }
  });

  // Disconnect
  socket.on('disconnect',()=> {
    if (socket.user != null) {
      kit.delUser(socket.user.id);
      socket.broadcast.emit('system', socket.user, 'logout');
      log.logLoginMessage(socket.user,'logout');
    }
  });
  
  // Group Chat
  socket.on('groupMessage',(from, to,message,type)=>{
    // Check whether a user is still online
    if (!socket.user) {
      from.roomId = socket.id;
      socket.user = from;
      users.push(from);
      socket.broadcast.emit('system', from, 'join');
      socket.emit('loginSuccess', from, []);
    }
    socket.broadcast.emit('groupMessage', socket.user, to,message,type);
    log.logUserMessage(socket.user,to,message,type)
  });
  
  // One-to-one chat
  socket.on('message',(from, to,message,type)=> {
    // if the user disconnect, reset the connection... 
    if (!socket.user) {
      from.roomId = socket.id;
      socket.user = from;
      users.push(from);
      socket.broadcast.emit('system', from, 'join');
      socket.emit('loginSuccess', from, []);
    }
    socket.broadcast.to(to.roomId).emit('message', socket.user, to,message,type);
    log.logUserMessage(socket.user,to,message,type)
  });
  
  // Reconnect 
  if(socket.handshake.query.User){
    let user=JSON.parse(socket.handshake.query.User);
    socket.user = user;
    user.roomId = socket.id;
    user.address = socket.handshake.address.replace(/::ffff:/,"");
    console.log("User <"+user.name+"> successfully reconnect. ")
    socket.emit('loginSuccess', user, users);
    users.push(user)
    socket.broadcast.emit('system', user, 'join');
  }
});

// Start the server 
server.listen(PORT,()=> {
  console.log(`Server is now running under Port ${PORT}. `, `http://localhost:${PORT}`)
});
