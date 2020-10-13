const express = require("express");
const socketio = require("socket.io");
const path = require("path");
const http = require("http");

const PORT = process.env.PORT || 5001;

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// for static resources requested by index.html (css, js)
app.use("/public", express.static(path.join(__dirname, "public")));
// send index.html for all requests
app.get("/*", (req, res) => {
	res.sendFile(__dirname + "/public/index.html");
});

server.listen(PORT, () => console.log(`Server has started on port ${PORT}`));

// ************ GAME LOGIC *****************

// maintain ongoing games
let games = {};

io.on("connection", (socket) => {
	socket.on("createGame", (gameId, callback) =>
		handleCreateGame(socket, gameId, callback)
	);
	socket.on("joinGame", (gameId, callback) =>
		handleJoinGame(socket, gameId, callback)
	);
	socket.on("playerReady", (gameId, callback) =>
		handlePlayerReady(socket, gameId, callback)
	);
	socket.on("fire", handleFire);
	socket.on("fireReply", handleFireReply);
	socket.on("gameOver", handleGameOver);

	socket.on("disconnect", () => handleDisconnect(socket));
});

function handleCreateGame(socket, gameId, callback) {
	if (gameId in games) {
		callback({ err: "That game already exists" });
		return;
	}
	games[gameId] = [
		{
			id: socket.id,
			ready: false,
		},
	];
	socket.join(gameId, (err) => {
		if (err) {
			callback({ err });
			console.log(`Error: ${err}`);
		} else {
			callback({ msg: `Waiting for opponent to join: ${gameId}` });
		}
	});
}

function handleJoinGame(socket, gameId, callback) {
	if (!(gameId in games)) {
		console.log('game not found');
		callback({ err: "That game doesn't exist!" });
		return;
	}
	if (games[gameId].length !== 1) {
		console.log("game doesnt have room");
		callback({ err: "There's no room in that game!" });
		return;
	}

	games[gameId].push({
		id: socket.id,
		ready: false,
	});
	socket.join(gameId, (err) => {
		if (err) {
			callback({ err });
		} else {
			io.to(gameId).emit("playerJoined");
		}
	});
}

function handleDisconnect(socket) {
	const gameId = Object.keys(games).find(
		(gameId) => !!games[gameId].find((player) => player.id === socket.id)
	);
	if (gameId) {
		const playerIdx = findIndexByAttr(games[gameId], "id", socket.id);
		if (playerIdx > -1) {
			games[gameId].splice(playerIdx, 1);
			if (!games[gameId].length) {
				delete games[gameId];
			}
			io.to(gameId).emit("playerLeft");
		}
	}
}

// flag player as ready, and if both are ready start game
function handlePlayerReady(socket, gameId, callback) {
	if (!(gameId in games)) {
		callback(false);
		return;
	}
	const playerIdx = findIndexByAttr(games[gameId], "id", socket.id);
	if (playerIdx > -1) {
		games[gameId].splice(playerIdx, 1, {
			id: socket.id,
			ready: true,
		});
	}

	const allPlayersReady = games[gameId].every((player) => player.ready);
	if (allPlayersReady) {
		startGame(gameId);
	} else {
		callback(false);
	}
}

function handleFire(fireEvent) {
	io.to(fireEvent.gameId).emit("fire", fireEvent);
}

function handleFireReply(fireReplyEvent) {
	io.to(fireReplyEvent.gameId).emit("fireReply", fireReplyEvent);
}

function handleGameOver(gameId) {
	if (games[gameId]) {
		games[gameId].forEach((game) => (game.ready = false));
	}
}

function startGame(gameId) {
	if (games[gameId] && games[gameId].length === 2) {
		io.to(gameId).emit("startGame");
		const turnPlayerIdx = Math.random() < 0.5 ? 0 : 1;
		io.to(gameId).emit("playerTurn", games[gameId][turnPlayerIdx].id);
	}
}

function findIndexByAttr(arr, attr, value) {
	for (var i = 0; i < arr.length; i += 1) {
		if (arr[i][attr] === value) {
			return i;
		}
	}
	return -1;
}
