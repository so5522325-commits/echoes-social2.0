class LudoEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.boardSize = 450;
        this.gridSize = this.boardSize / 15;

        // Players: Red (User) & Green (Bot)
        this.players = {
            red: [
                { id: 0, pos: -1, home: false },
                { id: 1, pos: -1, home: false },
                { id: 2, pos: -1, home: false },
                { id: 3, pos: -1, home: false }
            ],
            green: [
                { id: 0, pos: -1, home: false },
                { id: 1, pos: -1, home: false },
                { id: 2, pos: -1, home: false },
                { id: 3, pos: -1, home: false }
            ]
        };

        this.currentTurn = 'red'; // 'red' or 'green'
        this.currentDice = null;
        this.hasRolled = false;
        this.gameOver = false;

        // Common path coordinates for 52 steps circuit
        this.path = [
            {r: 6, c: 1}, {r: 6, c: 2}, {r: 6, c: 3}, {r: 6, c: 4}, {r: 6, c: 5},
            {r: 5, c: 6}, {r: 4, c: 6}, {r: 3, c: 6}, {r: 2, c: 6}, {r: 1, c: 6}, {r: 0, c: 6},
            {r: 0, c: 7},
            {r: 0, c: 8}, {r: 1, c: 8}, {r: 2, c: 8}, {r: 3, c: 8}, {r: 4, c: 8}, {r: 5, c: 8},
            {r: 6, c: 9}, {r: 6, c: 10}, {r: 6, c: 11}, {r: 6, c: 12}, {r: 6, c: 13}, {r: 6, c: 14},
            {r: 7, c: 14},
            {r: 8, c: 14}, {r: 8, c: 13}, {r: 8, c: 12}, {r: 8, c: 11}, {r: 8, c: 10}, {r: 8, c: 9},
            {r: 9, c: 8}, {r: 10, c: 8}, {r: 11, c: 8}, {r: 12, c: 8}, {r: 13, c: 8}, {r: 14, c: 8},
            {r: 14, c: 7},
            {r: 14, c: 6}, {r: 13, c: 6}, {r: 12, c: 6}, {r: 11, c: 6}, {r: 10, c: 6}, {r: 9, c: 6},
            {r: 8, c: 5}, {r: 8, c: 4}, {r: 8, c: 3}, {r: 8, c: 2}, {r: 8, c: 1}, {r: 8, c: 0},
            {r: 7, c: 0}, {r: 6, c: 0}
        ];

        // Safe spots indices on path
        this.safeSpots = [0, 8, 13, 21, 26, 34, 39, 47];

        this.initListeners();
        this.drawBoard();
    }

    drawBoard() {
        const sz = this.gridSize;
        this.ctx.clearRect(0, 0, this.boardSize, this.boardSize);

        // Bases
        this.drawBase(0, 0, 6, 6, '#ef4444');   // Red Home Base
        this.drawBase(9, 0, 6, 6, '#3b82f6');   // Blue Base
        this.drawBase(0, 9, 6, 6, '#22c55e');   // Green Base
        this.drawBase(9, 9, 6, 6, '#eab308');   // Yellow Base

        // Center Home
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillRect(6 * sz, 6 * sz, 3 * sz, 3 * sz);

        // Path grid styling
        for (let r = 0; r < 15; r++) {
            for (let c = 0; c < 15; c++) {
                if ((r < 6 || r > 8) || (c < 6 || c > 8)) {
                    this.ctx.strokeStyle = '#cbd5e1';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(c * sz, r * sz, sz, sz);
                }
            }
        }

        // Draw Pawns
        this.drawPawns();
    }

    drawBase(startR, startC, rows, cols, color) {
        const sz = this.gridSize;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(startC * sz, startR * sz, cols * sz, rows * sz);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect((startC + 1) * sz, (startR + 1) * sz, (cols - 2) * sz, (rows - 2) * sz);
    }

    drawPawns() {
        const sz = this.gridSize;

        // Red Pawns (User)
        this.players.red.forEach((p, idx) => {
            let coords = this.getPawnPixelCoords('red', p.pos, idx);
            this.drawPawnCircle(coords.x, coords.y, '#ef4444', `R${idx+1}`);
        });

        // Green Pawns (Bot)
        this.players.green.forEach((p, idx) => {
            let coords = this.getPawnPixelCoords('green', p.pos, idx);
            this.drawPawnCircle(coords.x, coords.y, '#22c55e', `G${idx+1}`);
        });
    }

    getPawnPixelCoords(color, pos, idx) {
        const sz = this.gridSize;
        if (pos === -1) {
            // Home Yard coordinates
            const baseMap = {
                red: [{r:1,c:1}, {r:1,c:4}, {r:4,c:1}, {r:4,c:4}],
                green: [{r:10,c:1}, {r:10,c:4}, {r:13,c:1}, {r:13,c:4}]
            };
            const cell = baseMap[color][idx];
            return { x: (cell.c + 0.5) * sz, y: (cell.r + 0.5) * sz };
        } else if (pos >= 52) {
            // Home Column
            return { x: 7.5 * sz, y: 7.5 * sz };
        } else {
            const pathNode = this.path[pos];
            return { x: (pathNode.c + 0.5) * sz, y: (pathNode.r + 0.5) * sz };
        }
    }

    drawPawnCircle(x, y, color, label) {
        const sz = this.gridSize;
        this.ctx.beginPath();
        this.ctx.arc(x, y, sz * 0.35, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 10px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(label, x, y);
    }

    initListeners() {
        this.canvas.addEventListener('click', (e) => {
            if (this.currentTurn !== 'red' || !this.hasRolled || this.gameOver) return;

            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Check which red pawn was clicked
            this.players.red.forEach((p, idx) => {
                let coords = this.getPawnPixelCoords('red', p.pos, idx);
                let dist = Math.hypot(clickX - coords.x, clickY - coords.y);
                if (dist < this.gridSize * 0.5) {
                    this.movePawn('red', idx);
                }
            });
        });
    }

    rollDice(callback) {
        if (this.hasRolled || this.gameOver) return;
        
        this.currentDice = Math.floor(Math.random() * 6) + 1;
        document.getElementById('diceDisplay').textContent = this.currentDice;
        this.hasRolled = true;

        if (callback) callback(this.currentDice);

        // Check if red has any valid moves
        let hasValidMoves = this.players.red.some(p => {
            if (p.pos === -1 && this.currentDice === 6) return true;
            if (p.pos !== -1 && p.pos + this.currentDice <= 56) return true;
            return false;
        });

        if (!hasValidMoves) {
            setTimeout(() => {
                alert(`You rolled ${this.currentDice}. No valid moves available! Turn passed.`);
                this.switchTurn();
            }, 600);
        }
    }

    movePawn(color, pawnIdx) {
        let pawn = this.players[color][pawnIdx];
        
        // Rule: 6 needed to open from base
        if (pawn.pos === -1) {
            if (this.currentDice === 6) {
                pawn.pos = (color === 'red') ? 0 : 26; // Red starts at index 0, Green starts at index 26
                this.drawBoard();
                this.postMoveRules(color, true);
            } else {
                alert("6 aane par hi gotti base se bahar nikal sakti hai!");
            }
            return;
        }

        // Normal movement
        let newPos = pawn.pos + this.currentDice;
        if (newPos > 56) {
            alert("Exact number chahiye gotti ko home pahunchane ke liye!");
            return;
        }

        pawn.pos = newPos;
        if (pawn.pos === 56) {
            pawn.home = true;
            playSound('win');
            if (window.confetti) confetti();
            alert("🎉 Aapki gotti Home pahunch gayi!");
        }

        // Check cut/kill rule if on main circuit
        let extraTurn = (this.currentDice === 6);
        if (pawn.pos < 52) {
            let opponentColor = (color === 'red') ? 'green' : 'red';
            this.players[opponentColor].forEach(op => {
                if (op.pos === pawn.pos && !this.safeSpots.includes(op.pos)) {
                    op.pos = -1; // Send opponent back to base
                    extraTurn = true;
                    playSound('win');
                    alert(`⚔️ Shandar! Opponent ki gotti kaat di! +₹5 Bonus Cash reward!`);
                    if (window.addTransactionRecord) {
                        window.addTransactionRecord(`⚔️ Ludo Kill Bonus`, 5, 'income');
                    }
                }
            });
        }

        this.drawBoard();
        this.postMoveRules(color, extraTurn);
    }

    postMoveRules(color, extraTurn) {
        this.hasRolled = false;
        document.getElementById('diceDisplay').textContent = '-';

        // Check Win Condition
        if (this.players[color].every(p => p.home)) {
            this.gameOver = true;
            playSound('win');
            if (window.confetti) confetti();
            alert(`🏆 Badhai ho! Aapne Ludo Match jeet liya!`);
            if (window.addTransactionRecord) {
                window.addTransactionRecord(`🏆 Ludo Match Win`, 90, 'income');
            }
            return;
        }

        if (extraTurn) {
            alert("🎲 6 aane ya gotti katne par aapko ek aur extra chance mila hai!");
            if (color === 'green') {
                setTimeout(() => this.botPlay(), 1000);
            }
        } else {
            this.switchTurn();
        }
    }

    switchTurn() {
        this.currentTurn = (this.currentTurn === 'red') ? 'green' : 'red';
        document.getElementById('turnDisplay').textContent = (this.currentTurn === 'red') ? 'Your Turn' : "Bot Opponent's Turn";
        
        if (this.currentTurn === 'green') {
            document.getElementById('rollDiceBtn').disabled = true;
            setTimeout(() => this.botPlay(), 1200);
        } else {
            document.getElementById('rollDiceBtn').disabled = false;
        }
    }

    botPlay() {
        if (this.gameOver) return;
        let dice = Math.floor(Math.random() * 6) + 1;
        document.getElementById('diceDisplay').textContent = dice;
        this.currentDice = dice;

        // Bot AI Move logic
        let movablePawns = this.players.green.filter(p => {
            if (p.pos === -1 && dice === 6) return true;
            if (p.pos !== -1 && p.pos + dice <= 56) return true;
            return false;
        });

        setTimeout(() => {
            if (movablePawns.length > 0) {
                let pawnToMove = movablePawns[0];
                if (pawnToMove.pos === -1) {
                    pawnToMove.pos = 26;
                } else {
                    pawnToMove.pos += dice;
                    if (pawnToMove.pos === 56) pawnToMove.home = true;
                }
                
                let extraTurn = (dice === 6);
                this.drawBoard();
                this.postMoveRules('green', extraTurn);
            } else {
                alert(`Bot rolled ${dice}. No moves available.`);
                this.switchTurn();
            }
        }, 1000);
    }
}

window.LudoEngine = LudoEngine;
                                                                     
