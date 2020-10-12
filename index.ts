import { Server } from "http";
import express, { Application } from "express";
import socketio from "socket.io";
import path from "path";
import http from "http";

const { findIndexByAttr } = require("./utils");

const PORT = process.env.PORT || 5001;

const app: Application = express();
const server: Server = http.createServer(app);
const io: SocketIO.Server = socketio(server);

// for static resources requested by index.html (css, js)
app.use("/public", express.static(path.join(__dirname, "dist/public")));
// send index.html for all requests
app.get("/*", (req, res) => {
	res.sendFile(__dirname + "/dist/public/index.html");
});

server.listen(PORT, () => console.log(`Server has started on port ${PORT}`));

// ************ GAME LOGIC *****************

interface SocketCallbackPayload {
	err?: string;
	msg?: string;
}

interface Player {
	id: string;
	ready: boolean;
}

interface FireEvent {
    gameId: string,
    socketId: string,
    cell: number,
}

interface FireReplyEvent {
    gameId: string,
    socketId: string,
    cell: number,
    wasHit: boolean,
	wasSunk: boolean,
	hitShip: Number[] | null, 
    gameOver: boolean,
}

// maintain ongoing games
let games: { [id: string]: Player[] } = {};

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

function handleCreateGame(
	socket: SocketIO.Socket,
	gameId: string,
	callback: (data: SocketCallbackPayload) => void
) {
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

function handleJoinGame(
	socket: SocketIO.Socket,
	gameId: string,
	callback: (data: SocketCallbackPayload) => void
) {
	if (!(gameId in games)) {
		callback({ err: "That game doesn't exist!" });
		return;
	}
	if (games[gameId].length !== 1) {
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

function handleDisconnect(socket: SocketIO.Socket) {
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
function handlePlayerReady(
	socket: SocketIO.Socket,
	gameId: string,
	callback: (gameStarted: boolean) => void
) {
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

function handleFire(fireEvent: FireEvent) {
    io.to(fireEvent.gameId).emit("fire", fireEvent);
}

function handleFireReply(fireReplyEvent: FireReplyEvent) {
    io.to(fireReplyEvent.gameId).emit("fireReply", fireReplyEvent);
}

function handleGameOver(gameId: string) {
	if (games[gameId]) {
		games[gameId].forEach(game => game.ready = false);
	}
}

function startGame(gameId: string) {
    if (games[gameId] && games[gameId].length === 2) {
        io.to(gameId).emit("startGame");
        const turnPlayerIdx = Math.random() < 0.5 ? 0 : 1;
        io.to(gameId).emit("playerTurn", games[gameId][turnPlayerIdx].id);
    }
}
