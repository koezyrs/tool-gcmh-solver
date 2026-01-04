const resetBtn = document.getElementById('reset-btn');
const solveBtn = document.getElementById('solve-btn');
const boardEl = document.getElementById('game-board');
const statusMsg = document.getElementById('status-msg');
const tools = document.querySelectorAll('.tool-btn');

let ROWS = 7;
let COLS = 10;
let grid = []; // 2D array storing cell values: 'unknown', 'mine', 0-8
let currentTool = 'unknown';

// Initialize
function init() {
    setupTools();
    resetBtn.addEventListener('click', createBoard);
    solveBtn.addEventListener('click', runSolver);
    createBoard();
}

function setupTools() {
    tools.forEach(btn => {
        btn.addEventListener('click', () => {
            selectTool(btn.dataset.value);
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ignore if focus is on inputs
        if (e.target.tagName === 'INPUT') return;

        const key = e.key.toLowerCase();

        // Number keys 0-8
        if (key >= '0' && key <= '8') {
            selectTool(key);
            return;
        }

        // Shortcuts for Mine and Unknown
        if (key === 'm' || key === 'b') { // Mine / Bomb
            selectTool('mine');
        } else if (key === 'u' || key === ' ' || key === 'delete') { // Unknown / Reset
            selectTool('unknown');
        } else if (key === 'Enter') {
            runSolver();
        }
    });
}

function selectTool(value) {
    // Find button
    let targetBtn = null;
    tools.forEach(btn => {
        if (btn.dataset.value === value) {
            targetBtn = btn;
        }
    });

    if (targetBtn) {
        // Remove active class
        tools.forEach(t => t.classList.remove('active'));
        // Add active
        targetBtn.classList.add('active');
        currentTool = value;
    }
}

function createBoard() {
    // Fixed dimensions
    ROWS = 7;
    COLS = 10;

    grid = [];
    boardEl.style.gridTemplateColumns = `repeat(${COLS}, var(--cell-size))`;
    boardEl.innerHTML = '';

    for (let r = 0; r < ROWS; r++) {
        let row = [];
        for (let c = 0; c < COLS; c++) {
            row.push('unknown'); // Initial state
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.r = r;
            cell.dataset.c = c;

            // Interaction
            cell.addEventListener('mousedown', (e) => handleCellClick(r, c, e));
            // Optional: Drag paint ?? Maybe later. Click is safer for now.

            boardEl.appendChild(cell);
        }
        grid.push(row);
    }
    statusMsg.textContent = "Bảng đã được tạo. Hãy nhập trạng thái các ô.";
}

function handleCellClick(r, c, e) {
    // Apply current tool
    let val = currentTool;
    if (val !== 'unknown' && val !== 'mine') {
        val = parseInt(val);
    }

    // Update model
    grid[r][c] = val;

    // Update View
    renderCell(r, c);

    // Clear previous suggestions on edit?
    // User might want to keep them, but usually edits invalidate old state.
    // Let's clear suggestions visual only?
    // For now, keep it simple.
}

function renderCell(r, c) {
    const index = r * COLS + c;
    const cell = boardEl.children[index];

    // Reset classes
    cell.className = 'cell';
    cell.textContent = '';

    const val = grid[r][c];

    if (val === 'unknown') {
        cell.classList.add('unknown');
    } else if (val === 'mine') {
        cell.classList.add('mine');
        cell.textContent = '💣';
    } else {
        cell.classList.add(`val-${val}`);
        if (val > 0) cell.textContent = val;
    }
}

// ================= SOLVER LOGIC =================

function getNeighbors(r, c) {
    const neighbors = [];
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            const nr = r + i;
            const nc = c + j;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                neighbors.push({ r: nr, c: nc });
            }
        }
    }
    return neighbors;
}


function runSolver() {
    // Clear previous suggestions
    const cells = document.querySelectorAll('.cell');
    cells.forEach(c => {
        c.classList.remove('suggestion-safe');
        c.classList.remove('suggestion-mine');
    });

    let safeMoves = new Set();
    let mineMoves = new Set();

    let madeProgress = true;
    // Iterate until no new info is found
    while (madeProgress) {
        madeProgress = false;

        let initialSafeCount = safeMoves.size;
        let initialMineCount = mineMoves.size;

        // --- Step 1: Basic Neighbors Logic ---
        // Collect constraints for Step 2
        let constraints = [];

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const val = grid[r][c];

                // If it's a number (0-8)
                if (typeof val === 'number') {
                    const neighbors = getNeighbors(r, c);
                    let unknownNeighbors = [];
                    let knownMines = 0;

                    neighbors.forEach(n => {
                        const nVal = grid[n.r][n.c];
                        const key = `${n.r},${n.c}`;
                        // Treat as logic-mine if marked manually or deduced previously
                        if (nVal === 'mine' || mineMoves.has(key)) {
                            knownMines++;
                        } else if (nVal === 'unknown' && !safeMoves.has(key)) {
                            // Only count as unknown if NOT ALREADY deduced as safe
                            unknownNeighbors.push(n);
                        }
                    });

                    // Rule 1: Satisfaction
                    if (knownMines === val && unknownNeighbors.length > 0) {
                        unknownNeighbors.forEach(n => safeMoves.add(`${n.r},${n.c}`));
                    }

                    // Rule 2: Necessity
                    if (knownMines + unknownNeighbors.length === val && unknownNeighbors.length > 0) {
                        unknownNeighbors.forEach(n => mineMoves.add(`${n.r},${n.c}`));
                    }

                    // Save constraint for Step 2
                    // Constraint: The unknowns in this list MUST contain exactly (val - knownMines) mines.
                    if (unknownNeighbors.length > 0) {
                        constraints.push({
                            r: r, c: c,
                            minesNeeded: val - knownMines,
                            cells: unknownNeighbors
                        });
                    }
                }
            }
        }

        // --- Step 2: Set Difference / Subsets ---
        // Compare every pair of constraints
        // If SetA is subset of SetB, then Diff = SetB - SetA.
        // Mines in Diff = NeededB - NeededA.

        for (let i = 0; i < constraints.length; i++) {
            for (let j = 0; j < constraints.length; j++) {
                if (i === j) continue;

                const A = constraints[i];
                const B = constraints[j];

                // Check if A is subset of B
                // Convert A cells to CheckSet
                const setKeysA = new Set(A.cells.map(x => `${x.r},${x.c}`));
                const setKeysB = new Set(B.cells.map(x => `${x.r},${x.c}`));

                // A \subseteq B ?
                let isSubset = true;
                for (let k of setKeysA) {
                    if (!setKeysB.has(k)) {
                        isSubset = false;
                        break;
                    }
                }

                if (isSubset) {
                    // Diff = B - A
                    const diffCells = B.cells.filter(x => !setKeysA.has(`${x.r},${x.c}`));
                    const minesInDiff = B.minesNeeded - A.minesNeeded;

                    if (diffCells.length > 0) {
                        // Logic 1: All Safe
                        // If mines needed in Diff is 0, then all Diff are safe.
                        if (minesInDiff === 0) {
                            diffCells.forEach(x => safeMoves.add(`${x.r},${x.c}`));
                        }

                        // Logic 2: All Mines
                        // If mines needed in Diff equals size of Diff, then all Diff are mines.
                        if (minesInDiff === diffCells.length) {
                            diffCells.forEach(x => mineMoves.add(`${x.r},${x.c}`));
                        }
                    }
                }
            }
        }


        if (safeMoves.size > initialSafeCount || mineMoves.size > initialMineCount) {
            madeProgress = true;
        }
    }

    // Render suggestions
    let count = 0;

    // Clear previous
    cells.forEach(c => {
        c.classList.remove('suggestion-safe');
        c.classList.remove('suggestion-mine');
        c.classList.remove('suggestion-guess');
    });

    safeMoves.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        const idx = r * COLS + c;
        boardEl.children[idx].classList.add('suggestion-safe');
        count++;
    });

    mineMoves.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        const idx = r * COLS + c;
        if (grid[r][c] !== 'mine') {
            boardEl.children[idx].classList.add('suggestion-mine');
            count++;
        }
    });

    // --- BEST GUESS LOGIC (Exact Probability) ---
    // Rule: Only show guess if found NO 'safe' (green) updates this turn.
    let guessMsg = "";
    if (safeMoves.size === 0) {
        const bestGuesses = calculateProbabilities();

        if (bestGuesses.length > 0) {
            // Find min prob for display
            const first = bestGuesses[0];
            const probPercent = (first.prob * 100).toFixed(1);

            bestGuesses.forEach(item => {
                const [r, c] = item.key.split(',').map(Number);
                const idx = r * COLS + c;
                boardEl.children[idx].classList.add('suggestion-guess');
                // Optional: show probability on hover or text?
                // For now just highlight.
            });

            guessMsg = ` | Gợi ý (Vàng): Tỉ lệ bom thấp nhất (~${probPercent}%)`;
        }
    }

    if (count > 0) {
        statusMsg.textContent = `Tìm thấy ${safeMoves.size} ô an toàn và ${mineMoves.size} bom. (Màu xanh: Đi được, Đỏ: Có bom)${guessMsg}`;
    } else if (guessMsg) {
        statusMsg.textContent = `Không có nước đi chắc chắn.${guessMsg}`;
    } else {
        statusMsg.textContent = "Chưa tìm thấy bước đi chắc chắn nào và không đủ dữ liệu để đoán.";
    }
}


// ================= EXACT PROBABILITY CALCULATOR =================

function calculateProbabilities() {
    // 1. Identify Frontier
    // Frontier cells: Unknowns that are neighbors to a number
    // Active Constraints: Numbers that have unknown neighbors
    let frontierCells = new Set();
    let constraints = [];
    let cellToConstraint = new Map(); // key: cell_key, val: [constraint_indices]

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const val = grid[r][c];
            if (typeof val === 'number') {
                const neighbors = getNeighbors(r, c);
                let unknownNeighbors = [];
                let knownMines = 0;

                neighbors.forEach(n => {
                    const nVal = grid[n.r][n.c];
                    if (nVal === 'mine') knownMines++;
                    else if (nVal === 'unknown') unknownNeighbors.push(n);
                });

                if (unknownNeighbors.length > 0) {
                    const constraint = {
                        r: r, c: c,
                        minesNeeded: val - knownMines,
                        cells: unknownNeighbors
                    };
                    constraints.push(constraint);

                    const cIdx = constraints.length - 1;
                    unknownNeighbors.forEach(n => {
                        const key = `${n.r},${n.c}`;
                        frontierCells.add(key);
                        if (!cellToConstraint.has(key)) cellToConstraint.set(key, []);
                        cellToConstraint.get(key).push(cIdx);
                    });
                }
            }
        }
    }

    if (frontierCells.size === 0) return [];

    // 2. Group into Connected Components
    // Two cells are connected if they share a constraint.
    // We can just BFS on cells using constraints as edges.
    let visited = new Set();
    let allProbabilities = []; // { key: "r,c", prob: float }

    for (let cellKey of frontierCells) {
        if (visited.has(cellKey)) continue;

        // Start a new component
        let componentCells = [];
        let componentConstraintsIdx = new Set();
        let queue = [cellKey];
        visited.add(cellKey);

        while (queue.length > 0) {
            const currKey = queue.shift();
            componentCells.push(currKey);

            // Get constraints affecting this cell
            const cIndices = cellToConstraint.get(currKey) || [];
            cIndices.forEach(cIdx => {
                if (!componentConstraintsIdx.has(cIdx)) {
                    componentConstraintsIdx.add(cIdx);
                    // Add all other cells in this constraint to the queue
                    const constraint = constraints[cIdx];
                    constraint.cells.forEach(n => {
                        const nKey = `${n.r},${n.c}`;
                        if (!visited.has(nKey)) {
                            visited.add(nKey);
                            queue.push(nKey);
                        }
                    });
                }
            });
        }

        // 3. Solve Component
        const compConstraints = Array.from(componentConstraintsIdx).map(i => constraints[i]);
        const probs = solveComponent(componentCells, compConstraints);
        allProbabilities = allProbabilities.concat(probs);
    }

    // 4. Sort by probability (ascending)
    allProbabilities.sort((a, b) => a.prob - b.prob);

    // Filter to return only the lowest
    if (allProbabilities.length > 0) {
        const minP = allProbabilities[0].prob;
        // Return all that are close to minP
        return allProbabilities.filter(x => Math.abs(x.prob - minP) < 0.0001);
    }

    return [];
}

function solveComponent(cellKeys, constraints) {
    // Map cellKey -> index 0..N-1
    const keyToIndex = new Map();
    cellKeys.forEach((k, i) => keyToIndex.set(k, i));

    // Optimisation: Pre-process constraints to use indices
    const fastConstraints = constraints.map(c => ({
        needed: c.minesNeeded,
        indices: c.cells.map(cell => {
            const k = `${cell.r},${cell.c}`;
            // Note: It's possible a constraint involves cells NOT in this component?
            // No, by definition of connected component.
            return keyToIndex.get(k);
        }).filter(x => x !== undefined) // Should be all
    }));

    let solutions = 0;
    let mineCounts = new Array(cellKeys.length).fill(0);
    let currentAssignment = new Array(cellKeys.length).fill(0); // 0 or 1

    function recurse(idx) {
        if (idx === cellKeys.length) {
            // All assigned, Final Check (though we prune, so this might be redundant if pruning is perfect)
            // But pruning usually checks only fully assigned constraints or partials.
            // Let's rely on incremental check.
            solutions++;
            for (let i = 0; i < cellKeys.length; i++) {
                if (currentAssignment[i] === 1) mineCounts[i]++;
            }
            return;
        }

        // Try 0 (Safe)
        currentAssignment[idx] = 0;
        if (isValid(idx, 0)) {
            recurse(idx + 1);
        }

        // Try 1 (Mine)
        currentAssignment[idx] = 1;
        if (isValid(idx, 1)) {
            recurse(idx + 1);
        }
    }

    // Check constraints relevant to cell 'idx'
    function isValid(idx, val) {
        // We only need to check constraints that involve this cell (idx).
        // Since we don't have a map from idx back to constraints, we iterate all (or optimize later).
        // For N < 20-30, iterating all is fast enough? 
        // Optimization: Pre-calculate which constraints involve 'idx'.

        // Let's do simple check: Iterate all constraints
        for (let c of fastConstraints) {
            let placedMines = 0;
            let unknownCount = 0;
            let involvesCurrent = false;

            for (let i of c.indices) {
                if (i === idx) involvesCurrent = true;
                if (i <= idx) {
                    placedMines += currentAssignment[i];
                } else {
                    unknownCount++; // Not assigned yet
                }
            }

            // Pruning Rules:
            // 1. Too many mines already?
            if (placedMines > c.needed) return false;
            // 2. Not enough space to satisfy? (Need more than available unknowns)
            if (placedMines + unknownCount < c.needed) return false;
        }
        return true;
    }

    recurse(0);

    if (solutions === 0) return []; // Should not happen in consistent board

    return cellKeys.map((k, i) => ({
        key: k,
        prob: mineCounts[i] / solutions
    }));
}


init();
