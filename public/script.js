$(document).ready(function () {
	const socket = io();
	bindSocketEvents(socket);

	const infoOverlay = $(".overlay");
	const yourGrid = $(".your-grid");
	const theirGrid = $(".their-grid");
    const statusBar = $(".status-bar");
    const randomizeBtn = $(".randomize-btn");
    const dragShip = $(".drag-ship");
    const dragShipOutline = $(".drag-ship-outline");
    
	let ships;
	let isYourTurn;
	// cells that have a ship
	let shipIdxs;
	// cells that have been hit
    let hitIdxs = [];
    // cells with/adjacent to a ship
    let takenIdxs = [];
    
    fillGrids();
    drawRandomShips();
    randomizeBtn.on("click", drawRandomShips);

	let gameId = window.location.pathname.split("/")[1];
	if (gameId) {
		socket.emit("joinGame", gameId, (data) => console.log(data));
	} else {
		gameId = `${Math.floor(Math.random() * 100000000)}`.slice(0, 7);
		socket.emit("createGame", `${gameId}`, (data) =>
			displayJoinLink(data, gameId)
		);
		history.pushState({}, null, gameId);
	}

    function drawRandomShips() {
        ships = randomizeShips();
        calculateShipInfo(ships);
        drawShips();
    }

	function fillGrids() {
		$(".grid-wrapper").each(function () {
			const grid = $(this).find(".grid");
			for (let i = 0; i < 100; i++) {
				grid.append(`<div class="cell" data-cell=${i}></div>`);
			}
			addCellClickHandlers();

			const letters = "ABCDEFGHIJ";
			const colLabels = $(this).find(".col-labels");
			for (let j = 0; j < 10; j++) {
				colLabels.append(`<div class="col-label">${letters[j]}</div>`);
			}
			const rowLabels = $(this).find(".row-labels");
			for (let k = 1; k <= 10; k++) {
				rowLabels.append(`<div class="row-label">${k}</div>`);
			}
		});
	}

	function drawShips() {
        // reset all cells first
        $(".your-grid .cell").removeClass("with-ship");

        // add ship class to relevant cells
		$(".your-grid .cell").each(function(idx) {
			if (shipIdxs.indexOf(idx) > -1) {
				$(this).addClass("with-ship");
            }
        });
        
        bindMouseDown(true);
	}

	function markFiredCell(markYourGrid, cell, wasHit, wasSunk, hitShip) {
		const gridEl = markYourGrid ? yourGrid : theirGrid;
		const cellEl = gridEl.find(`.cell[data-cell="${cell}"]`);
		cellEl.addClass(wasHit ? "hit" : "missed");

		// if sunk, add sunk class to all cells in ship
		if (wasSunk && hitShip) {
			hitShip.forEach((sunkCell) =>
				gridEl.find(`.cell[data-cell="${sunkCell}"]`).addClass("sunk")
			);
		}

		// remove previous "most recent fire" bg, add to new cell
		gridEl.find(".cell").removeClass("most-recent");
		cellEl.addClass("most-recent");

		// if hit, mark off limit diagonal cells
		if (wasHit) {
			const offLimitCells = calculateShipOffLimitCells(
				cell,
				wasSunk,
				hitShip
			);
			offLimitCells.forEach((cellNum) => {
				gridEl
					.find(`.cell[data-cell="${cellNum}"]`)
					.addClass("off-limits");
			});
		}
	}

	function handlePlayerJoined() {
		const startBtn = $(`<button class="btn">Play</button>`).on("click", handlePlayerReady);
		showInfoOverlay(`Ready to start?`);
		infoOverlay.append(startBtn);
	}

	function handlePlayerReady() {
		socket.emit("playerReady", gameId, (gameStarted) => {
			if (!gameStarted) {
				showInfoOverlay("Waiting for your opponent...");
			}
        });
        
        randomizeBtn.css("visibility", "hidden");
        bindMouseDown(false);
	}

	function handlePlayerTurn(playerId) {
		isYourTurn = playerId === socket.id;
		togglePlayerTurn(isYourTurn);
	}

	function togglePlayerTurn(isYourTurn) {
		yourGrid.toggleClass("disabled", isYourTurn);
		theirGrid.toggleClass("disabled", !isYourTurn);
		statusBar.html(
			isYourTurn ? "Your turn!" : "Waiting on your opponent..."
		);
	}

	function handleStartGame() {
		infoOverlay.removeClass("open");
	}

	function handleFire({ socketId, cell }) {
		// mark cell and reply if opponent fired
		if (socketId !== socket.id) {
			const wasHit = yourGrid
				.find(`.cell[data-cell="${cell}"]`)
				.hasClass("with-ship");
			let wasSunk = false;
			let hitShip = null;
			let gameOver = false;

			if (wasHit) {
				hitIdxs.push(cell);
				hitShip = ships.find((ship) => ship.indexOf(cell) > -1);
				if (hitShip.length) {
					wasSunk = hitShip.every(
						(cell) => hitIdxs.indexOf(cell) > -1
					);
				}
				gameOver = ships.every((ship) =>
					ship.every((cell) => hitIdxs.indexOf(cell) > -1)
				);
			}

			markFiredCell(true, cell, wasHit, wasSunk, hitShip);
			socket.emit("fireReply", {
				gameId: gameId,
				socketId: socketId,
				cell: cell,
				wasHit,
				wasSunk,
				hitShip,
				gameOver,
			});
		}
	}

	function handleFireReply({
		socketId,
		cell,
		wasHit,
		wasSunk,
		hitShip,
		gameOver,
	}) {
		const wasYourFire = socket.id === socketId;
		// mark if you fired (opponent replied)
		if (wasYourFire) {
			markFiredCell(false, cell, wasHit, wasSunk, hitShip);
		}
		if (!wasHit) {
			togglePlayerTurn(!wasYourFire);
		}

		if (gameOver) {
			statusBar.addClass(wasYourFire ? "won" : "lost");
            statusBar.html(wasYourFire ? "You won!" : "You lost :(");
            theirGrid.addClass("disabled");
		}
	}

	function addCellClickHandlers() {
		$(".their-grid .cell").on("click", function () {
			socket.emit("fire", {
				gameId: gameId,
				socketId: socket.id,
				cell: Number($(this).attr("data-cell")),
			});
		});
	}

	function showInfoOverlay(html) {
		infoOverlay.addClass("open");
		infoOverlay.html(html);
	}

	function displayJoinLink({ err }, socketGameId) {
		if (err) {
			showInfoOverlay(
				"There was an issue creating a game :/ try reloading"
			);
			return;
		}
		const gameLink = `${window.location.origin}/${socketGameId}`;
		showInfoOverlay(
			`Invite a friend:&nbsp;<a href="${gameLink}" target="_blank"> ${gameLink}</a>`
		);
	}

	function bindSocketEvents(socket) {
		socket.on("playerLeft", () => alert("Your opponent disconnected :("));
		socket.on("playerJoined", handlePlayerJoined);
		socket.on("startGame", handleStartGame);
		socket.on("playerTurn", handlePlayerTurn);
		socket.on("fire", handleFire);
		socket.on("fireReply", handleFireReply);
	}

	// *********** UTILITY FUNCTIONS **************

	function randomizeShips() {
		const shipLengths = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
        const ships = [];
        takenIdxs = [];

		shipLengths.forEach((len) => {
			const availSpots = makeAvailableShipSpots(len);
			const ship = availSpots[Math.floor(Math.random() * availSpots.length)];
			const offLimits = calculateSurroundingShipCells(ship);

			ships.push(ship);
			takenIdxs.push(...ship, ...offLimits);
		});

		return ships;
	}

	// list of lists - available spots for a ship of a given length
	function makeAvailableShipSpots(length) {
		const spots = [];
		const startCells = [...Array(100).keys()].filter(
			(cell) => takenIdxs.indexOf(cell) < 0
		);

		// potential horizontal/vertical spots for each free cell - filter out if invalid
		startCells.forEach((cell) => {
			let horizSpot = null;
			let vertSpot = null;

			// only make potential spots if there's room starting from start cell
			if ((cell % 10) + length <= 10) {
				horizSpot = [...Array(length).keys()].map((i) => cell + i);
			}
			if (cell / 10 + length <= 10) {
				vertSpot = [...Array(length).keys()].map((i) => cell + i * 10);
            }
            
            const filteredSpots = [horizSpot, vertSpot].filter(spot => {
                return spot && !spot.some(i => takenIdxs.indexOf(i) > -1 || i < 0 || i > 99);
            });

			spots.push(...filteredSpots);
        });
        return spots;
    }

    function calculateAllOffLimitCells(ships) {
		return ships.reduce((acc, ship) => {
			return [
                ...acc, 
                ...ship,
                ...calculateSurroundingShipCells(ship)
            ];
		}, []);
	}

    function calculateShipOffLimitCells(cell, wasSunk, hitShip) {
		if (wasSunk && hitShip) {
			return calculateSurroundingShipCells(hitShip);
		}
		const offLimits = [];
		if (cell % 10 > 0) {
			// top/bottom left
			offLimits.push(cell - 11, cell + 9);
		}
		if (cell % 10 < 9) {
			// top/bottom right
			offLimits.push(cell - 9, cell + 11);
		}
		return offLimits.filter((c) => c >= 0 && c <= 99);
	}

	function calculateSurroundingShipCells(ship) {
		const offLimits = [];
		ship.forEach((cell) => {
			if (cell % 10 > 0) {
				// lefts
				offLimits.push(cell - 11, cell - 1, cell + 9);
			}
			if (cell % 10 < 9) {
				// rights
				offLimits.push(cell - 9, cell + 1, cell + 11);
			}
			if (cell >= 10) {
				// top
				offLimits.push(cell - 10);
			}
			if (cell < 90) {
				// bottom
				offLimits.push(cell + 10);
			}
		});
		return [...new Set(offLimits)].filter(
			(c) => c >= 0 && c <= 99 && ship.indexOf(c) < 0
		);
    }

    function calculateShipInfo(ships) {
        shipIdxs = ships.reduce((acc, ship) => [...acc, ...ship], []);
        takenIdxs = calculateAllOffLimitCells(ships);
    }
    
    // ***************** DRAG & DROP ********************

    let heldShip;
    let newShipSpot;
    let mouseOffset = [0, 0];
    
    $(document).on("mousedown", e => e.preventDefault());
    $(document).on("mouseup", () => {
        if (heldShip) {
            dragShip.hide();
            dragShipOutline.hide();
            if (newShipSpot) {
                // draw new ship
                newShipSpot.forEach(cell => yourGrid.find(`.cell[data-cell=${cell}]`).addClass("with-ship"));
                // replace old ship with new spot
                const oldShipIdx = ships.findIndex(ship => ship.indexOf(heldShip[0]) > -1);
                ships = [
                    ...ships.slice(0, oldShipIdx),
                    newShipSpot,
                    ...ships.slice(oldShipIdx + 1)
                ];
                // re-calculate ship/taken idxs
                calculateShipInfo(ships);
                // re-bind mouse down for future ship moves
                bindMouseDown(true);
            } else {
                // re-draw original dragged ship
                heldShip.forEach(cell => yourGrid.find(`.cell[data-cell=${cell}]`).addClass("with-ship"));
            }
            heldShip = null;
            newShipSpot = null;
        }
    });

    function bindMouseDown(enable) {
        const yourShips = yourGrid.find(".with-ship");
        yourShips.off("mousedown");
        if (enable) {
            yourGrid.find(".with-ship").on("mousedown", function(e) {
                heldShip = ships.find(s => s.indexOf(Number($(this).attr("data-cell"))) > -1);
                if (heldShip) { 
                    // hide actual ship that's being dragged
                    heldShip.forEach(cell => yourGrid.find(`.cell[data-cell="${cell}"]`).removeClass("with-ship"));
                    
                    const firstShipCell = yourGrid.find(`.cell[data-cell="${heldShip[0]}"]`);
                    const isHorizontal = heldShip.length === 1 || heldShip[1] - heldShip[0] === 1;
                    mouseOffset = [
                        firstShipCell[0].offsetLeft - e.clientX,
                        firstShipCell[0].offsetTop - e.clientY,
                    ];
                    // place "fake" ship where original ship was
                    dragShip.css({
                        display: "block",
                        width: isHorizontal ? heldShip.length * 40 : 40,
                        height: !isHorizontal ? heldShip.length * 40 : 40,
                        top: firstShipCell[0].offsetTop,
                        left: firstShipCell[0].offsetLeft,
                    });
                }
            });
        } else {
            yourShips.addClass("game-started");
        }
    }

    $(document).on("mousemove", function(e) {
        e.preventDefault();
        // follow mouse on drag
        if (heldShip) {
            const mouseLeft = e.clientX + mouseOffset[0];
            const mouseTop = e.clientY + mouseOffset[1];
            dragShip.css({
                left: mouseLeft,
				top: mouseTop,
			});
            
            // check where dragged ship would be dropped, outline if valid
            const startCell = Math.round(mouseTop / 40) * 10 + Math.round(mouseLeft / 40);
            const isHorizontal = heldShip.length === 1 || heldShip[1] - heldShip[0] === 1;

            // make sure ship starting at start cell fits in the grid
            if (!isValidStartCell(startCell, heldShip.length, isHorizontal)) {
                return;
            }

            // make new ship for potential placement
            const newShipSpotPotential = [...Array(heldShip.length).keys()]
                .map(i => startCell + (i * (isHorizontal ? 1 : 10)));
                
            // ignore the currently dragged ship when determining valid new spots
            const shipsIgnoringHeldShip = ships.filter(ship => ship.indexOf(heldShip[0]) < 0);
            const takenIdxsIgnoringHeldShip = calculateAllOffLimitCells(shipsIgnoringHeldShip);

            const validNewShipSpot = !newShipSpotPotential.some(cell => takenIdxsIgnoringHeldShip.indexOf(cell) > -1);
            if (validNewShipSpot) {
                // show that ship can be dropped here
                dragShipOutline.css({
					display: "block",
					width: isHorizontal ? newShipSpotPotential.length * 40 : 40,
					height: !isHorizontal ? newShipSpotPotential.length * 40 : 40,
					top: Math.floor(newShipSpotPotential[0] / 10) * 40,
					left: (newShipSpotPotential[0] % 10) * 40,
                });
                newShipSpot = newShipSpotPotential;
            } else {
                newShipSpot = null;
                dragShipOutline.hide();
            }
        }
    });

    function isValidStartCell(cell, shipLength, isHorizontal) {
        return cell >= 0 && cell < 100
            && (isHorizontal ? cell % 10 : Math.floor(cell / 10)) + shipLength <= 10;
    }
});
