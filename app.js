const express = require('express'),
  app = express(),
  server = require('http').createServer(app),
  io = require('socket.io').listen(server),
  PORT= process.env.PORT || 2000,
  users = [],
  idles = [],
  blacklist = {};
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
    });
	idles.forEach(function (item, index) {
      if (item.id == id) {
        idles.splice(index, 1);
      }
    });
	delete blacklist[id];
  },
  // find a user 
  findUser(id) {
	for (let item of users) {
		if (item.id == id) {
			return item;
		}
	}
  },
  // find idle users 
  findIdles(user) {
	  for (const [index, item] of idles.entries()) {
		  if (!blacklist[item.id].includes(user.id) && item.id != user.id) {
			  idles.splice(index, 1);
			  return item;
		  }
	  }
	  return null;
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
	  blacklist[user.id] = [];
      socket.broadcast.emit('system', user, 'join');
      log.logLoginMessage(user,'join');
    }
  });
  
  // Find new pair
  socket.on('pairup', (from, to)=> {
	  // Check whether a user is still online
	  if (!socket.user) {
        from.roomId = socket.id;
        socket.user = from;
        users.push(from);
		blacklist[from.id] = [];
        socket.broadcast.emit('system', from, 'join');
        socket.emit('loginSuccess', from, []);
      }
	  if (to != null) {
		  // console.log("2");
		  const userA = socket.user;
		  const userB = kit.findUser(to);
		  // console.log(userA);
		  // console.log(userB);
		  blacklist[userA.id].push(userB.id);
		  blacklist[userB.id].push(userA.id);
		  socket.emit('system', userB, 'logout');
		  socket.broadcast.to(userB.roomId).emit('system', userA, 'logout');
		  var idle = kit.findIdles(userA);
		  if (idle == null) {
			  idles.push(userA);
		  } else {
			  socket.emit('pair', idle);
			  socket.broadcast.to(idle.roomId).emit('pair', userA);
			  log.logUserMessage(idle, userA, "Pair Up");	
		  }
		  idle = kit.findIdles(userB);
		  if (idle == null) {
			  idles.push(userB);
		  } else {
			  socket.broadcast.to(userB.roomId).emit('pair', idle);
			  socket.broadcast.to(idle.roomId).emit('pair', userB);
			  log.logUserMessage(idle, userB, "Pair Up");	
		  }
	  } else {
		  const userA = socket.user;
		  var idle = kit.findIdles(userA);
		  if (idle == null) {
			  idles.push(userA);
		  } else {
			  socket.emit('pair', idle);
			  socket.broadcast.to(idle.roomId).emit('pair', userA);
			  log.logUserMessage(idle, userA, "Pair Up");	
		  }
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
	  blacklist[from.id] = [];
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
	  blacklist[from.id] = [];
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
    users.push(user);
	blacklist[user.id] = [];
    socket.broadcast.emit('system', user, 'join');
  }
});

// Start the server 
server.listen(PORT,()=> {
  console.log(`Server is now running under Port ${PORT}. `, `http://localhost:${PORT}`)
});
