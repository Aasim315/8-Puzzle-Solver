const GOAL_STATE = ["1", "2", "3", "4", "5", "6", "7", "8", ""];
const MAIN_START = ["1", "2", "3", "4", "5", "6", "7", "", "8"];
const MAX_EXPANDED_NODES = 181440;
const HISTORY_KEY = "puzzleAI.history";
const RECORDS_KEY = "puzzleAI.records";
const SETTINGS_KEY = "puzzleAI.settings";

class MinHeap {
    constructor(compare) {
        this.items = [];
        this.compare = compare;
    }

    get size() {
        return this.items.length;
    }

    push(value) {
        const items = this.items;
        items.push(value);
        let index = items.length - 1;

        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.compare(items[index], items[parent]) >= 0) break;
            [items[index], items[parent]] = [items[parent], items[index]];
            index = parent;
        }
    }

    pop() {
        if (this.items.length === 0) return null;
        const first = this.items[0];
        const last = this.items.pop();
        if (this.items.length > 0) {
            this.items[0] = last;
            let index = 0;

            while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                let smallest = index;
                if (left < this.items.length &&
                    this.compare(this.items[left], this.items[smallest]) < 0) {
                    smallest = left;
                }
                if (right < this.items.length &&
                    this.compare(this.items[right], this.items[smallest]) < 0) {
                    smallest = right;
                }
                if (smallest === index) break;
                [this.items[index], this.items[smallest]] =
                    [this.items[smallest], this.items[index]];
                index = smallest;
            }
        }
        return first;
    }
}

function stateKey(state) {
    return state.join(",");
}

function isValidState(state) {
    return Array.isArray(state) &&
        state.length === 9 &&
        state.every(value => typeof value === "string" && /^[1-8]?$/.test(value)) &&
        new Set(state).size === 9 &&
        state.includes("");
}

function isSolvable(state) {
    const numbered = state.filter(tile => tile !== "").map(Number);
    let inversions = 0;
    for (let i = 0; i < numbered.length; i++) {
        for (let j = i + 1; j < numbered.length; j++) {
            if (numbered[i] > numbered[j]) inversions++;
        }
    }
    return inversions % 2 === 0;
}

function manhattanDistance(state) {
    let distance = 0;
    for (let index = 0; index < state.length; index++) {
        const tile = state[index];
        if (tile === "") continue;
        const goalIndex = Number(tile) - 1;
        distance += Math.abs(Math.floor(index / 3) - Math.floor(goalIndex / 3));
        distance += Math.abs((index % 3) - (goalIndex % 3));
    }
    return distance;
}

function getNeighbors(state) {
    const neighbors = [];
    const blank = state.indexOf("");
    const row = Math.floor(blank / 3);
    const col = blank % 3;
    const moves = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [rowMove, colMove] of moves) {
        const nextRow = row + rowMove;
        const nextCol = col + colMove;
        if (nextRow < 0 || nextRow >= 3 || nextCol < 0 || nextCol >= 3) continue;
        const nextIndex = nextRow * 3 + nextCol;
        const nextState = [...state];
        nextState[blank] = nextState[nextIndex];
        nextState[nextIndex] = "";
        neighbors.push(nextState);
    }
    return neighbors;
}

function reconstructPath(goalKey, states, parents) {
    const path = [];
    let key = goalKey;
    while (key !== null) {
        path.push([...states.get(key)]);
        key = parents.get(key);
    }
    return path.reverse();
}

function solvePuzzle(startState, strategy = "astar", maxExpanded = MAX_EXPANDED_NODES) {
    if (!isValidState(startState) || !isSolvable(startState)) return null;
    const startedAt = performance.now();
    const start = [...startState];
    const startKey = stateKey(start);
    const states = new Map([[startKey, start]]);
    const parents = new Map([[startKey, null]]);
    const bestCosts = new Map([[startKey, 0]]);
    const closed = new Set();
    const compare = strategy === "bfs"
        ? (a, b) => a.g - b.g || a.order - b.order
        : strategy === "greedy"
            ? (a, b) => a.h - b.h || a.order - b.order
            : (a, b) => a.f - b.f || a.h - b.h || a.order - b.order;
    const open = new MinHeap(compare);
    let order = 0;
    open.push({
        key: startKey,
        g: 0,
        h: manhattanDistance(start),
        f: manhattanDistance(start),
        order: order++
    });
    let expanded = 0;
    let peakOpen = 1;

    while (open.size > 0 && expanded < maxExpanded) {
        const current = open.pop();
        if (current.g !== bestCosts.get(current.key) || closed.has(current.key)) continue;
        if (current.key === stateKey(GOAL_STATE)) {
            return {
                path: reconstructPath(current.key, states, parents),
                stats: {
                    expanded,
                    discovered: states.size,
                    peakOpen,
                    searchTime: performance.now() - startedAt
                }
            };
        }

        closed.add(current.key);
        expanded++;
        const currentState = states.get(current.key);
        for (const neighbor of getNeighbors(currentState)) {
            const key = stateKey(neighbor);
            const cost = current.g + 1;
            if (closed.has(key) || (bestCosts.has(key) && bestCosts.get(key) <= cost)) continue;
            bestCosts.set(key, cost);
            states.set(key, neighbor);
            parents.set(key, current.key);
            const heuristic = manhattanDistance(neighbor);
            open.push({
                key,
                g: cost,
                h: heuristic,
                f: cost + heuristic,
                order: order++
            });
            peakOpen = Math.max(peakOpen, open.size);
        }
    }

    return {
        path: null,
        stats: {
            expanded,
            discovered: states.size,
            peakOpen,
            searchTime: performance.now() - startedAt,
            limited: open.size > 0
        }
    };
}

function createPuzzle(mode, startState) {
    return {
        mode,
        current: [...startState],
        attemptStart: [...startState],
        appliedCustomStart: [...startState],
        playerMoves: 0,
        initialDistance: manhattanDistance(startState),
        attemptStartedAt: null,
        solution: null,
        playbackStep: 0,
        playbackTimer: null,
        playbackPlaying: false,
        playbackPaused: false,
        playbackElapsed: 0,
        playbackStartedAt: 0,
        solutionStats: null,
        hints: new Map()
    };
}

const puzzles = {
    main: createPuzzle("main", MAIN_START),
    custom: createPuzzle("custom", MAIN_START)
};
let activeSearch = null;
let animationDelay = 400;

function formatMilliseconds(value) {
    return `${Number(value).toFixed(2)} ms`;
}

function getBoard(mode) {
    return document.querySelector(`[data-board="${mode}"]`);
}

function getDashboard(mode) {
    return document.querySelector(`[data-dashboard="${mode}"]`);
}

function setStat(mode, name, value) {
    const output = getDashboard(mode).querySelector(`[data-stat="${name}"]`);
    if (output) output.textContent = String(value);
}

function renderBoard(mode) {
    const puzzle = puzzles[mode];
    const board = getBoard(mode);
    board.replaceChildren();
    puzzle.current.forEach((value, index) => {
        const tile = document.createElement("div");
        tile.className = `tile${value === "" ? " empty" : ""}`;
        tile.textContent = value;
        tile.dataset.index = String(index);
        tile.setAttribute("role", "gridcell");
        tile.setAttribute("tabindex", "0");
        tile.setAttribute("aria-label", value === "" ? "Empty space" : `Tile ${value}`);
        board.append(tile);
    });
}

function updateDashboard(mode) {
    const puzzle = puzzles[mode];
    const currentDistance = manhattanDistance(puzzle.current);
    setStat(mode, "playerMoves", puzzle.playerMoves);
    setStat(mode, "playerTime", puzzle.attemptStartedAt === null
        ? "—"
        : formatMilliseconds(performance.now() - puzzle.attemptStartedAt));
    setStat(mode, "currentDistance", currentDistance);
    setStat(mode, "initialDistance", puzzle.initialDistance);
    setStat(mode, "improvement", puzzle.initialDistance - currentDistance);
    setStat(mode, "solutionMoves", puzzle.solution
        ? puzzle.solution.length - 1
        : "—");
    setStat(mode, "playbackProgress", puzzle.solution
        ? `${puzzle.playbackStep} / ${puzzle.solution.length - 1}`
        : "—");
    setStat(mode, "searchTime", puzzle.solutionStats
        ? formatMilliseconds(puzzle.solutionStats.searchTime)
        : "—");
    setStat(mode, "playbackTime", puzzle.solution
        ? formatMilliseconds(getPlaybackElapsed(puzzle))
        : "—");
    setStat(mode, "expanded", puzzle.solutionStats ? puzzle.solutionStats.expanded : "—");
    setStat(mode, "discovered", puzzle.solutionStats ? puzzle.solutionStats.discovered : "—");
    setStat(mode, "peakOpen", puzzle.solutionStats ? puzzle.solutionStats.peakOpen : "—");
    const pathCost = puzzle.solution ? puzzle.playbackStep : puzzle.playerMoves;
    setStat(mode, "gCost", pathCost);
    setStat(mode, "hCost", currentDistance);
    setStat(mode, "fCost", pathCost + currentDistance);
    const pathSummary = document.querySelector(`[data-path-summary="${mode}"]`);
    const pathRatio = document.querySelector(`[data-path-ratio="${mode}"]`);
    if (puzzle.solution && puzzle.solutionStats) {
        const pathStates = puzzle.solution.length;
        const discovered = puzzle.solutionStats.discovered;
        pathSummary.textContent = `${pathStates} / ${discovered}`;
        pathRatio.max = String(Math.max(1, discovered));
        pathRatio.value = String(pathStates);
    } else {
        pathSummary.textContent = "—";
        pathRatio.max = "1";
        pathRatio.value = "0";
    }
}

function setPuzzleStatus(mode, message, solverStatus) {
    document.querySelector(`[data-status="${mode}"]`).textContent = message;
    setStat(mode, "solverStatus", solverStatus);
}

function clearSolution(puzzle) {
    puzzle.solution = null;
    puzzle.solutionStats = null;
    puzzle.playbackStep = 0;
    puzzle.playbackElapsed = 0;
}

function clearHint(mode, message = "") {
    const board = getBoard(mode);
    board.querySelectorAll(".hint-tile, .hint-destination").forEach(tile => {
        tile.classList.remove("hint-tile", "hint-destination");
    });
    document.querySelector(`[data-hint="${mode}"]`).textContent = message;
}

function updatePlaybackControls(mode) {
    const puzzle = puzzles[mode];
    const hasSolution = Boolean(puzzle.solution);
    const active = puzzle.playbackPlaying || puzzle.playbackPaused;
    const anotherModeActive = Object.entries(puzzles).some(([otherMode, otherPuzzle]) =>
        otherMode !== mode && (otherPuzzle.playbackPlaying || otherPuzzle.playbackPaused)
    ) || (activeSearch !== null && activeSearch !== mode);
    const actions = {
        pause: !puzzle.playbackPlaying,
        resume: !puzzle.playbackPaused,
        previous: !hasSolution || puzzle.playbackStep <= 0 || puzzle.playbackPlaying,
        next: !hasSolution || puzzle.playbackStep >= puzzle.solution.length - 1 || puzzle.playbackPlaying,
        replay: !hasSolution || puzzle.playbackPlaying,
        cancel: !active
    };
    for (const [action, disabled] of Object.entries(actions)) {
        const button = document.querySelector(`[data-action="${action}-${mode}"]`);
        if (button) button.disabled = disabled || anotherModeActive;
    }
}

function hasPlaybackActivity() {
    return Object.values(puzzles).some(puzzle =>
        puzzle.playbackPlaying || puzzle.playbackPaused
    );
}

function updatePuzzleControls(mode) {
    const puzzle = puzzles[mode];
    const locked = hasPlaybackActivity() || activeSearch !== null;
    const actionNames = mode === "main"
        ? ["reset-main", "random-main", "solve-main", "hint-main"]
        : ["apply-custom", "reset-custom", "restart-custom", "solve-custom", "hint-custom"];
    actionNames.forEach(action => {
        const button = document.querySelector(`[data-action="${action}"]`);
        if (button) button.disabled = locked;
    });
    if (mode === "custom") {
        document.querySelectorAll(".custom-input-grid input").forEach(input => {
            input.disabled = locked;
        });
    }
    const compareButton = document.querySelector('[data-action="compare"]');
    compareButton.disabled = locked;
    updatePlaybackControls(mode);
}

function getPlaybackElapsed(puzzle) {
    if (puzzle.playbackPlaying) {
        return puzzle.playbackElapsed + performance.now() - puzzle.playbackStartedAt;
    }
    return puzzle.playbackElapsed;
}

function renderSolutionStep(mode) {
    const puzzle = puzzles[mode];
    clearHint(mode);
    puzzle.current = [...puzzle.solution[puzzle.playbackStep]];
    renderBoard(mode);
    updateDashboard(mode);
}

function finishPlayback(mode) {
    const puzzle = puzzles[mode];
    if (puzzle.playbackTimer !== null) {
        clearInterval(puzzle.playbackTimer);
        puzzle.playbackTimer = null;
    }
    if (puzzle.playbackPlaying) {
        puzzle.playbackElapsed += performance.now() - puzzle.playbackStartedAt;
    }
    puzzle.playbackPlaying = false;
    puzzle.playbackPaused = false;
    if (puzzle.playbackStep === puzzle.solution.length - 1) {
        setPuzzleStatus(mode, `PUZZLE SOLVED // ${puzzle.playbackStep} MOVES`, "Completed");
        console.log("Puzzle solved!");
    }
    updateDashboard(mode);
    for (const puzzleMode of ["main", "custom"]) updatePuzzleControls(puzzleMode);
}

function advancePlayback(mode, direction = 1) {
    const puzzle = puzzles[mode];
    if (!puzzle.solution) return;
    const nextStep = Math.max(0, Math.min(puzzle.solution.length - 1, puzzle.playbackStep + direction));
    puzzle.playbackStep = nextStep;
    renderSolutionStep(mode);
    setPuzzleStatus(mode, `AI PLAYBACK // ${nextStep}/${puzzle.solution.length - 1} MOVES`,
        puzzle.playbackPaused ? "Paused" : "Playing");
    if (nextStep === puzzle.solution.length - 1 &&
        (puzzle.playbackPlaying || puzzle.playbackPaused)) {
        finishPlayback(mode);
    } else {
        updatePlaybackControls(mode);
    }
}

function startPlayback(mode) {
    const puzzle = puzzles[mode];
    if (!puzzle.solution || puzzle.playbackPlaying) return;
    if (puzzle.solution.length === 1) {
        puzzle.playbackStep = 0;
        renderSolutionStep(mode);
        setPuzzleStatus(mode, "PUZZLE SOLVED // 0 MOVES", "Completed");
        updatePuzzleControls(mode);
        return;
    }
    if (puzzle.playbackStep >= puzzle.solution.length - 1) return;
    puzzle.playbackPlaying = true;
    puzzle.playbackPaused = false;
    puzzle.playbackStartedAt = performance.now();
    puzzle.playbackTimer = setInterval(() => {
        if (puzzle.playbackStep >= puzzle.solution.length - 1) {
            finishPlayback(mode);
            return;
        }
        advancePlayback(mode, 1);
        updateDashboard(mode);
    }, animationDelay);
    setPuzzleStatus(mode, `AI PLAYBACK // ${puzzle.playbackStep}/${puzzle.solution.length - 1} MOVES`, "Playing");
    for (const puzzleMode of ["main", "custom"]) updatePuzzleControls(puzzleMode);
}

function pausePlayback(mode) {
    const puzzle = puzzles[mode];
    if (!puzzle.playbackPlaying) return;
    clearInterval(puzzle.playbackTimer);
    puzzle.playbackTimer = null;
    puzzle.playbackElapsed += performance.now() - puzzle.playbackStartedAt;
    puzzle.playbackPlaying = false;
    puzzle.playbackPaused = true;
    setPuzzleStatus(mode, `PLAYBACK PAUSED // ${puzzle.playbackStep} MOVES`, "Paused");
    updateDashboard(mode);
    for (const puzzleMode of ["main", "custom"]) updatePuzzleControls(puzzleMode);
}

function cancelPlayback(mode) {
    const puzzle = puzzles[mode];
    if (puzzle.playbackTimer !== null) clearInterval(puzzle.playbackTimer);
    if (puzzle.playbackPlaying) {
        puzzle.playbackElapsed += performance.now() - puzzle.playbackStartedAt;
    }
    puzzle.playbackTimer = null;
    puzzle.playbackPlaying = false;
    puzzle.playbackPaused = false;
    setPuzzleStatus(mode, "PLAYBACK CANCELLED // READY", "Cancelled");
    updateDashboard(mode);
    for (const puzzleMode of ["main", "custom"]) updatePuzzleControls(puzzleMode);
}

function beginAttempt(mode, startState, message) {
    const puzzle = puzzles[mode];
    cancelPlayback(mode);
    puzzle.current = [...startState];
    puzzle.attemptStart = [...startState];
    if (mode === "custom") {
        puzzle.appliedCustomStart = [...startState];
        document.querySelectorAll(".custom-input-grid input").forEach((input, index) => {
            input.value = startState[index] === "" ? "0" : startState[index];
        });
    }
    puzzle.playerMoves = 0;
    puzzle.initialDistance = manhattanDistance(startState);
    puzzle.attemptStartedAt = null;
    clearSolution(puzzle);
    clearHint(mode, `${mode === "main" ? "Main" : "Custom"} puzzle restarted. Request a hint for this position.`);
    renderBoard(mode);
    setPuzzleStatus(mode, message, "Ready");
    updateDashboard(mode);
    updatePuzzleControls(mode);
}

function recordManualCompletion(mode, puzzle) {
    const elapsed = puzzle.attemptStartedAt === null
        ? 0
        : performance.now() - puzzle.attemptStartedAt;
    const records = loadStored(RECORDS_KEY, { bestMoves: null, bestTime: null });
    records.bestMoves = records.bestMoves === null
        ? puzzle.playerMoves
        : Math.min(records.bestMoves, puzzle.playerMoves);
    records.bestTime = records.bestTime === null
        ? elapsed
        : Math.min(records.bestTime, elapsed);
    saveStored(RECORDS_KEY, records);
    updateRecordDisplay();
    const history = loadStored(HISTORY_KEY, []);
    history.unshift({
        mode,
        completedAt: new Date().toISOString(),
        moves: puzzle.playerMoves,
        elapsedMs: elapsed,
        start: [...puzzle.attemptStart]
    });
    saveStored(HISTORY_KEY, history.slice(0, 10));
    renderHistory();
}

function handleManualMove(mode, index) {
    const puzzle = puzzles[mode];
    if (hasPlaybackActivity() || activeSearch !== null) return;
    if (stateKey(puzzle.current) === stateKey(GOAL_STATE)) return;
    const blank = puzzle.current.indexOf("");
    const distance = Math.abs(Math.floor(index / 3) - Math.floor(blank / 3)) +
        Math.abs(index % 3 - blank % 3);
    if (distance !== 1) return;

    [puzzle.current[blank], puzzle.current[index]] =
        [puzzle.current[index], puzzle.current[blank]];
    if (puzzle.attemptStartedAt === null) {
        puzzle.attemptStartedAt = performance.now();
    }
    puzzle.playerMoves++;
    clearSolution(puzzle);
    clearHint(mode, "Puzzle changed. Request a new hint for this position.");
    renderBoard(mode);
    updateDashboard(mode);
    if (stateKey(puzzle.current) === stateKey(GOAL_STATE)) {
        setPuzzleStatus(mode, "PUZZLE SOLVED // NICE WORK!", "Solved by player");
        recordManualCompletion(mode, puzzle);
    } else {
        setPuzzleStatus(mode, "MOVE REGISTERED // IN PROGRESS", "In progress");
    }
    updatePuzzleControls(mode);
}

function validateCustomInput() {
    const values = Array.from(document.querySelectorAll(".custom-input-grid input"),
        input => input.value.trim());
    if (values.length !== 9 || values.some(value => !/^[0-8]$/.test(value))) {
        return { error: "Enter all nine digits from 0 to 8. Use 0 for the blank." };
    }
    if (new Set(values).size !== 9) {
        return { error: "Each digit from 0 to 8 must appear exactly once." };
    }
    const state = values.map(value => value === "0" ? "" : value);
    if (!isSolvable(state)) {
        return { error: "This arrangement is valid but unsolvable for the standard goal." };
    }
    return { state };
}

function getOrSearchSolution(puzzle) {
    const key = stateKey(puzzle.current);
    if (puzzle.hints.has(key)) return puzzle.hints.get(key);
    const result = solvePuzzle(puzzle.current);
    if (result && result.path) puzzle.hints.set(key, result);
    return result;
}

function showHint(mode) {
    const puzzle = puzzles[mode];
    clearHint(mode);
    if (mode === "custom") {
        const validation = validateCustomInput();
        const hintMessage = document.querySelector(`[data-hint="${mode}"]`);
        if (validation.error) {
            hintMessage.textContent = validation.error;
            return;
        }
        if (stateKey(validation.state) !== stateKey(puzzle.appliedCustomStart)) {
            hintMessage.textContent = "Apply the edited custom arrangement before requesting a hint.";
            return;
        }
    }
    if (stateKey(puzzle.current) === stateKey(GOAL_STATE)) {
        document.querySelector(`[data-hint="${mode}"]`).textContent = "The puzzle is already solved.";
        return;
    }
    const result = getOrSearchSolution(puzzle);
    if (!result || !result.path || result.path.length < 2) {
        document.querySelector(`[data-hint="${mode}"]`).textContent =
            "No legal hint is available for this arrangement.";
        return;
    }
    const nextState = result.path[1];
    const blankIndex = puzzle.current.indexOf("");
    const nextBlankIndex = nextState.indexOf("");
    const tileValue = puzzle.current[nextBlankIndex];
    const tiles = getBoard(mode).querySelectorAll(".tile");
    tiles[blankIndex].classList.add("hint-destination");
    tiles[nextBlankIndex].classList.add("hint-tile");
    document.querySelector(`[data-hint="${mode}"]`).textContent =
        `Move tile ${tileValue} into the highlighted empty space.`;
}

async function solveAndPlay(mode) {
    const puzzle = puzzles[mode];
    if (activeSearch !== null || hasPlaybackActivity()) return;
    if (mode === "custom") {
        const validation = validateCustomInput();
        const message = document.querySelector("#custom-message");
        if (validation.error) {
            message.textContent = validation.error;
            message.classList.add("error-message");
            return;
        }
        if (stateKey(validation.state) !== stateKey(puzzle.appliedCustomStart)) {
            message.textContent = "The inputs contain a new arrangement. Apply it before starting the custom solver.";
            message.classList.add("error-message");
            return;
        }
        if (!isValidState(puzzle.current) || !isSolvable(puzzle.current)) {
            message.textContent = "The current custom board is invalid or unsolvable. Apply a valid puzzle to continue.";
            message.classList.add("error-message");
            return;
        }
        message.textContent = "Solving the current custom board arrangement.";
        message.classList.remove("error-message");
    }

    activeSearch = mode;
    setPuzzleStatus(mode, "AI SEARCH // RUNNING", "Searching");
    for (const puzzleMode of ["main", "custom"]) updatePuzzleControls(puzzleMode);
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
        let result = puzzle.hints.get(stateKey(puzzle.current));
        if (!result) result = solvePuzzle(puzzle.current);
        if (!result || !result.path) {
            const limited = result && result.stats && result.stats.limited;
            setPuzzleStatus(mode, limited
                ? "SEARCH LIMIT REACHED // TRY A SIMPLER STATE"
                : "NO SOLUTION FOUND // CHECK THE ARRANGEMENT",
            limited ? "Search limit" : "No solution");
            if (result && result.stats) {
                puzzle.solutionStats = result.stats;
                updateDashboard(mode);
            }
            return;
        }
        puzzle.hints.set(stateKey(puzzle.current), result);
        puzzle.solution = result.path;
        puzzle.solutionStats = result.stats;
        puzzle.playbackStep = 0;
        puzzle.playbackElapsed = 0;
        renderSolutionStep(mode);
        console.log("Solution found!");
        console.log("Moves required:", puzzle.solution.length - 1);
        if (mode === "custom") {
            document.querySelector("#custom-message").textContent =
                "Custom solution found. Playback is ready.";
        }
        if (puzzle.solution.length === 1) {
            setPuzzleStatus(mode, "PUZZLE SOLVED // 0 MOVES", "Completed");
            console.log("Puzzle solved!");
        } else {
            startPlayback(mode);
        }
    } catch (error) {
        console.error("The puzzle solver failed.", error);
        setPuzzleStatus(mode, "SOLVER ERROR // SEE CONSOLE", "Error");
        if (mode === "custom") {
            document.querySelector("#custom-message").textContent =
                "The solver encountered an error. Check the browser console.";
        }
    } finally {
        activeSearch = null;
        for (const puzzleMode of ["main", "custom"]) updatePuzzleControls(puzzleMode);
    }
}

function loadStored(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch (error) {
        console.warn(`Could not read saved ${key} data.`, error);
        return fallback;
    }
}

function saveStored(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`Could not save ${key} data.`, error);
    }
}

function renderHistory() {
    const history = loadStored(HISTORY_KEY, []);
    const list = document.querySelector("#puzzle-history");
    list.replaceChildren();
    history.forEach(entry => {
        const item = document.createElement("li");
        const date = new Date(entry.completedAt).toLocaleString();
        const modeLabel = entry.mode === "custom" ? "Custom" : "Main";
        item.textContent = `${modeLabel}: ${entry.moves} player moves · ${formatMilliseconds(entry.elapsedMs)} · ${date}`;
        list.append(item);
    });
}

function updateRecordDisplay() {
    const records = loadStored(RECORDS_KEY, { bestMoves: null, bestTime: null });
    document.querySelector("#best-player-moves").textContent =
        records.bestMoves === null ? "—" : String(records.bestMoves);
    document.querySelector("#best-player-time").textContent =
        records.bestTime === null ? "—" : formatMilliseconds(records.bestTime);
}

function saveSettings(settings) {
    saveStored(SETTINGS_KEY, settings);
}

function initializeSettings() {
    const settings = loadStored(SETTINGS_KEY, { speed: 400, theme: "dark", accent: "cyan" });
    const speed = [800, 400, 180].includes(Number(settings.speed))
        ? Number(settings.speed)
        : 400;
    animationDelay = speed;
    document.querySelector("#animation-speed").value = String(speed);
    const theme = "dark"; // PuzzleAI is intentionally locked to dark mode.
    const accent = ["cyan", "violet", "mint"].includes(settings.accent)
        ? settings.accent
        : "cyan";
    document.body.dataset.theme = theme;
    document.body.dataset.accent = accent;
    document.querySelector("#accent-choice").value = accent;
}

function exportSolution(mode) {
    const puzzle = puzzles[mode];
    if (!puzzle.solution) {
        setPuzzleStatus(mode, "SOLVE A PUZZLE BEFORE EXPORTING", "No solution");
        return;
    }
    const data = {
        mode,
        start: puzzle.solution[0],
        goal: puzzle.solution[puzzle.solution.length - 1],
        solutionMoves: puzzle.solution.length - 1,
        searchStats: puzzle.solutionStats,
        path: puzzle.solution
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `puzzle-${mode}-solution.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function compareAlgorithms() {
    if (activeSearch !== null || hasPlaybackActivity()) return;
    const status = document.querySelector(".comparison-status");
    status.textContent = "Comparing algorithms on the current main-puzzle state…";
    const compareButton = document.querySelector('[data-action="compare"]');
    compareButton.disabled = true;
    const start = [...puzzles.main.current];
    const rows = [
        ["astar", "astar"],
        ["greedy", "greedy"],
        ["bfs", "bfs"]
    ];
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
        for (const [rowName, strategy] of rows) {
            const result = solvePuzzle(start, strategy, 25000);
            const row = document.querySelector(`[data-algorithm="${rowName}"]`);
            const cells = row.querySelectorAll("td");
            cells[0].textContent = result && result.path ? String(result.path.length - 1) : "—";
            cells[1].textContent = result && result.stats ? String(result.stats.expanded) : "—";
            cells[2].textContent = result && result.stats
                ? formatMilliseconds(result.stats.searchTime)
                : "—";
            cells[3].textContent = result && result.path
                ? rowName === "greedy" ? "Found; not guaranteed optimal" : "Optimal"
                : result && result.stats && result.stats.limited
                    ? "25,000-node limit"
                    : "No solution";
        }
        status.textContent =
            "Comparison complete (25,000 expanded-node cap per algorithm). Runtime varies by device; BFS may use substantially more memory.";
    } catch (error) {
        console.error("Algorithm comparison failed.", error);
        status.textContent = "Comparison failed. Check the browser console.";
    } finally {
        compareButton.disabled = false;
    }
}

function handleAction(action) {
    if (action === "reset-main") {
        beginAttempt("main", MAIN_START, "INITIAL STATE // READY");
        return;
    }
    if (action === "random-main") {
        let state = [...GOAL_STATE];
        let previousBlank = -1;
        for (let move = 0; move < 30; move++) {
            const blank = state.indexOf("");
            const options = getNeighbors(state);
            let choices = options.filter(next => next.indexOf("") !== previousBlank);
            if (choices.length === 0) choices = options;
            const next = choices[Math.floor(Math.random() * choices.length)];
            previousBlank = blank;
            state = next;
        }
        beginAttempt("main", state, "RANDOM STATE // READY");
        return;
    }
    if (action === "apply-custom") {
        const validation = validateCustomInput();
        const message = document.querySelector("#custom-message");
        if (validation.error) {
            message.textContent = validation.error;
            message.classList.add("error-message");
            return;
        }
        message.textContent = "Valid puzzle applied. You can play, request a hint, or solve it with AI.";
        message.classList.remove("error-message");
        beginAttempt("custom", validation.state, "CUSTOM STATE // READY");
        puzzles.custom.appliedCustomStart = [...validation.state];
        return;
    }
    if (action === "reset-custom") {
        beginAttempt("custom", puzzles.custom.appliedCustomStart, "CUSTOM PUZZLE // RESET");
        const message = document.querySelector("#custom-message");
        message.textContent = "Restored the last successfully applied custom arrangement.";
        message.classList.remove("error-message");
        return;
    }
    if (action === "restart-custom") {
        beginAttempt("custom", puzzles.custom.attemptStart, "CUSTOM ATTEMPT // RESTARTED");
        const message = document.querySelector("#custom-message");
        message.textContent = "Custom attempt restarted from its saved starting arrangement.";
        message.classList.remove("error-message");
        return;
    }
    if (action === "solve-main") {
        solveAndPlay("main");
        return;
    }
    if (action === "solve-custom") {
        solveAndPlay("custom");
        return;
    }
    if (action === "hint-main" || action === "hint-custom") {
        showHint(action.endsWith("main") ? "main" : "custom");
        return;
    }
    const playbackMatch = action.match(/^(pause|resume|previous|next|replay|cancel)-(main|custom)$/);
    if (playbackMatch) {
        const [, command, mode] = playbackMatch;
        const puzzle = puzzles[mode];
        if (command === "pause") pausePlayback(mode);
        if (command === "resume") startPlayback(mode);
        if (command === "previous" && !puzzle.playbackPlaying) {
            puzzle.playbackPaused = true;
            advancePlayback(mode, -1);
        }
        if (command === "next" && !puzzle.playbackPlaying) {
            puzzle.playbackPaused = true;
            advancePlayback(mode, 1);
        }
        if (command === "replay") {
            if (puzzle.playbackTimer !== null) clearInterval(puzzle.playbackTimer);
            puzzle.playbackTimer = null;
            puzzle.playbackPlaying = false;
            puzzle.playbackPaused = false;
            puzzle.playbackStep = 0;
            puzzle.playbackElapsed = 0;
            renderSolutionStep(mode);
            if (puzzle.solution.length === 1) {
                setPuzzleStatus(mode, "PUZZLE SOLVED // 0 MOVES", "Completed");
                updatePuzzleControls(mode);
                return;
            }
            setPuzzleStatus(mode, "PLAYBACK REPLAY // STARTING", "Playing");
            startPlayback(mode);
        }
        if (command === "cancel") cancelPlayback(mode);
        return;
    }
    if (action === "export-main") exportSolution("main");
    if (action === "export-custom") exportSolution("custom");
    if (action === "compare") compareAlgorithms();
    if (action === "clear-history") {
        saveStored(HISTORY_KEY, []);
        renderHistory();
    }
    if (action === "reset-records") {
        saveStored(RECORDS_KEY, { bestMoves: null, bestTime: null });
        updateRecordDisplay();
    }
}

document.addEventListener("click", event => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
        handleAction(actionButton.dataset.action);
        return;
    }
    const tile = event.target.closest(".tile");
    if (!tile) return;
    const board = tile.closest("[data-board]");
    if (board) handleManualMove(board.dataset.board, Number(tile.dataset.index));
});

document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const tile = event.target.closest(".tile");
    if (!tile) return;
    event.preventDefault();
    const board = tile.closest("[data-board]");
    if (board) handleManualMove(board.dataset.board, Number(tile.dataset.index));
});

document.querySelector("#animation-speed").addEventListener("change", event => {
    animationDelay = Number(event.target.value);
    saveSettings({
        speed: animationDelay,
        theme: "dark",
        accent: document.querySelector("#accent-choice").value
    });
});

document.querySelector("#accent-choice").addEventListener("change", event => {
    document.body.dataset.accent = event.target.value;
    saveSettings({
        speed: animationDelay,
        theme: "dark",
        accent: event.target.value
    });
});

for (const mode of ["main", "custom"]) {
    renderBoard(mode);
    updateDashboard(mode);
    updatePlaybackControls(mode);
}
initializeSettings();
renderHistory();
updateRecordDisplay();
