// MANDATE: The District Game - Game Logic with SMART AI
// A 3-player strategy card game

const COLORS = ['blue', 'green', 'yellow', 'red', 'purple', 'grey'];
const COLOR_NAMES = {
    blue: 'Institution',
    green: 'Base',
    yellow: 'Media',
    red: 'Capital',
    purple: 'Ideology',
    grey: 'Logistics'
};

const PLAYERS = ['left', 'indie', 'right'];
const PLAYER_NAMES = { left: 'LEFT', indie: 'INDEPENDENT', right: 'RIGHT' };

// Game State
let deck = [];
let players = {
    left: { hand: [], score: 0 },
    indie: { hand: [], score: 0 },
    right: { hand: [], score: 0 }
};
let districts = [];
let currentPlayer = 'indie';
let selectedCard = null;
let hasPlayedCard = false;
let gameOver = false;

// Round System
let currentRound = 1;
let roundWins = { left: 0, indie: 0, right: 0 };
const STARTING_PLAYERS = ['indie', 'left', 'right']; // Each round different starter

// BO3 Tiebreaker tracking
let totalDistrictsWon = { left: 0, indie: 0, right: 0 };  // Across all rounds
let bestCombinations = { left: 99, indie: 99, right: 99 }; // Best (lowest rank = better)

// Initialize a round
function initRound(startingPlayer) {
    deck = createDeck();
    shuffleDeck(deck);

    players = {
        left: { hand: [], score: 0 },
        indie: { hand: [], score: 0 },
        right: { hand: [], score: 0 }
    };

    for (let p of PLAYERS) {
        for (let i = 0; i < 6; i++) {
            players[p].hand.push(deck.pop());
        }
    }

    districts = [];
    for (let i = 0; i < 7; i++) {
        districts.push({
            id: i,
            claimed: false,
            claimedBy: null,
            sides: { left: [], indie: [], right: [] }
        });
    }

    currentPlayer = startingPlayer;
    selectedCard = null;
    hasPlayedCard = false;
    gameOver = false;

    updateScores();
    updateRoundDisplay();
    renderDistricts();
    renderHand();
    updateTurnIndicator();
    updateDeckCount();
    clearLog();

    log(`=== ROUND ${currentRound} of 3 ===`, '');
    log(`${PLAYER_NAMES[startingPlayer]} starts this round.`, startingPlayer);

    if (startingPlayer !== 'indie') {
        // AI starts first
        setTimeout(() => aiTurn(startingPlayer), 800);
    }
}

// Start a new game (all 3 rounds)
function initGame() {
    currentRound = 1;
    roundWins = { left: 0, indie: 0, right: 0 };
    totalDistrictsWon = { left: 0, indie: 0, right: 0 };
    bestCombinations = { left: 99, indie: 99, right: 99 };
    comboHistory = [];
    initRound(STARTING_PLAYERS[0]); // First round: indie starts
    updateStatsPanel();
}

function createDeck() {
    let cards = [];
    for (let color of COLORS) {
        cards.push({ color: color, value: 'A', numValue: 11 });
        for (let v = 2; v <= 10; v++) {
            cards.push({ color: color, value: v.toString(), numValue: v });
        }
    }
    for (let i = 0; i < 3; i++) {
        cards.push({ color: 'crisis', value: '?', numValue: 0, isCrisis: true });
    }
    return cards;
}

function shuffleDeck(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// Render functions
function renderDistricts() {
    const container = document.getElementById('districts');
    container.innerHTML = '';

    districts.forEach((district, idx) => {
        const div = document.createElement('div');
        div.className = 'district' + (district.claimed ? ` claimed claimed-${district.claimedBy}` : '');
        div.innerHTML = `
            <div class="district-header">District ${idx + 1}</div>
            <div class="district-sides">
                ${renderDistrictSide(district, 'left', idx)}
                ${renderDistrictSide(district, 'indie', idx)}
                ${renderDistrictSide(district, 'right', idx)}
            </div>
        `;
        container.appendChild(div);
    });
}

function renderDistrictSide(district, player, districtIdx) {
    const cards = district.sides[player];
    const isSelectable = player === 'indie' && selectedCard !== null && cards.length < 3 && !district.claimed && !hasPlayedCard;
    const sideClass = `${player}-side ${isSelectable ? 'selectable' : ''}`;

    let cardsHtml = cards.length === 0
        ? `<span class="side-label">${player === 'indie' ? 'Your side' : player}</span>`
        : cards.map(c => `<div class="mini-card ${c.displayColor || c.color}">${c.displayValue || c.value}</div>`).join('');

    return `<div class="district-side ${sideClass}" onclick="playCard(${districtIdx}, '${player}')">${cardsHtml}</div>`;
}

function renderHand() {
    const container = document.getElementById('player-hand');
    container.innerHTML = '';

    players.indie.hand.forEach((card, idx) => {
        const div = document.createElement('div');
        div.className = `card ${card.color}` + (selectedCard === idx ? ' selected' : '');
        div.innerHTML = `
            <span class="value">${card.value}</span>
            <span class="type-label">${card.isCrisis ? 'Crisis' : COLOR_NAMES[card.color] || ''}</span>
        `;
        div.onclick = () => selectCard(idx);
        container.appendChild(div);
    });
}

function selectCard(idx) {
    if (hasPlayedCard || currentPlayer !== 'indie') return;
    selectedCard = selectedCard === idx ? null : idx;
    renderHand();
    renderDistricts();
}

function playCard(districtIdx, player) {
    if (currentPlayer !== 'indie' || player !== 'indie') return;
    if (selectedCard === null || hasPlayedCard) return;

    const district = districts[districtIdx];
    if (district.claimed || district.sides.indie.length >= 3) return;

    const card = players.indie.hand[selectedCard];

    if (card.isCrisis) {
        showCrisisModal(districtIdx);
        return;
    }

    district.sides.indie.push({ ...card });
    players.indie.hand.splice(selectedCard, 1);
    selectedCard = null;
    hasPlayedCard = true;

    log(`You played ${card.value} of ${COLOR_NAMES[card.color]} to District ${districtIdx + 1}`, 'indie');

    renderHand();
    renderDistricts();

    // Check for claims - get claimed count before and after
    const claimedBefore = districts.filter(d => d.claimed).length;
    autoClaimDistricts('indie');
    const claimedAfter = districts.filter(d => d.claimed).length;

    // If a claim was made, auto-end turn
    if (claimedAfter > claimedBefore && !gameOver) {
        setTimeout(() => {
            if (!gameOver) endTurn();
        }, 800);
    }

    updateButtons();
}

function showCrisisModal(districtIdx) {
    const modal = document.getElementById('crisis-modal');
    modal.classList.add('active');

    document.getElementById('confirm-crisis').onclick = () => {
        const color = document.getElementById('crisis-color').value;
        const value = document.getElementById('crisis-value').value;

        const card = players.indie.hand[selectedCard];
        const playedCard = {
            ...card,
            displayColor: color,
            displayValue: value,
            color: color,
            value: value,
            numValue: parseInt(value)
        };

        districts[districtIdx].sides.indie.push(playedCard);
        players.indie.hand.splice(selectedCard, 1);
        selectedCard = null;
        hasPlayedCard = true;

        log(`You played Crisis as ${value} of ${COLOR_NAMES[color]} to District ${districtIdx + 1}`, 'indie');

        modal.classList.remove('active');
        renderHand();
        renderDistricts();

        // Check for claims
        const claimedBefore = districts.filter(d => d.claimed).length;
        autoClaimDistricts('indie');
        const claimedAfter = districts.filter(d => d.claimed).length;

        // If a claim was made, auto-end turn
        if (claimedAfter > claimedBefore && !gameOver) {
            setTimeout(() => {
                if (!gameOver) endTurn();
            }, 800);
        }

        updateButtons();
    };
}

function updateButtons() {
    document.getElementById('end-turn-btn').disabled = !hasPlayedCard;
}

// Auto-claim all districts where ANY player has a winning configuration
function autoClaimDistricts(triggeringPlayer) {
    if (gameOver) return;

    for (let i = 0; i < districts.length; i++) {
        const d = districts[i];
        if (d.claimed) continue;

        // Check each player for claim conditions
        for (let player of PLAYERS) {
            if (d.sides[player].length !== 3) continue;

            const hasTotalMandate = isTotalMandate(d.sides[player]);

            // Total Mandate (AAA) - IMMEDIATE claim, no need to wait!
            if (hasTotalMandate) {
                log(`🔥 TOTAL MANDATE! Immediate claim!`, player);
                claimDistrict(i, player);
                if (gameOver) return;
                break; // Move to next district
            }

            // Regular claim: need at least 2 players to have completed
            const completedPlayers = PLAYERS.filter(p => d.sides[p].length === 3).length;
            if (completedPlayers >= 2) {
                const winner = evaluateDistrict(d);
                claimDistrict(i, player);
                if (gameOver) return;
                break; // Move to next district
            }
        }
    }
}

function claimDistrict(districtIdx, claimingPlayer) {
    const d = districts[districtIdx];
    const winner = evaluateDistrict(d);

    d.claimed = true;
    d.claimedBy = winner;
    players[winner].score++;

    // Track for BO3 tiebreaker
    totalDistrictsWon[winner]++;

    // Track best combination for winner
    const winnerConfig = evaluateConfiguration(d.sides[winner]);
    if (winnerConfig.rank < bestCombinations[winner]) {
        bestCombinations[winner] = winnerConfig.rank;
    }

    // Record combination for stats panel
    recordCombination(winner, districtIdx, winnerConfig);

    // Log detailed configuration info
    const configNames = {
        1: 'Total Mandate (AAA)',
        2: 'Color Run',
        3: 'Unified Message (Triple)',
        4: 'Same Color',
        5: 'Momentum (Run)',
        6: 'Party (Pair)',
        7: 'Raw Pressure'
    };

    let details = [];
    for (let p of PLAYERS) {
        if (d.sides[p].length === 3) {
            const config = evaluateConfiguration(d.sides[p]);
            const playerName = p === 'indie' ? 'YOU' : PLAYER_NAMES[p];

            // For Party, decode pair value and kicker
            let displayValue = config.value;
            if (config.rank === 6) {
                const pairVal = Math.floor(config.value / 100);
                const kickerVal = config.value % 100;
                displayValue = `pair ${pairVal}, kicker ${kickerVal}`;
            }

            details.push(`${playerName}: ${configNames[config.rank]} (${displayValue})`);
        }
    }

    log(`District ${districtIdx + 1} → ${details.join(' vs ')}`, '');
    log(`🏆 ${PLAYER_NAMES[winner]} wins District ${districtIdx + 1}!`, winner);

    updateScores();
    updateRoundDisplay();
    updateStatsPanel();
    renderDistricts();
    checkWinCondition();
}

function evaluateDistrict(district) {
    let scores = {};

    for (let p of PLAYERS) {
        if (district.sides[p].length === 3) {
            scores[p] = evaluateConfiguration(district.sides[p]);
        } else {
            scores[p] = { rank: 99, value: 0 };
        }
    }

    let winner = null;
    let bestScore = { rank: 99, value: 0 };

    for (let p of PLAYERS) {
        if (scores[p].rank < bestScore.rank ||
            (scores[p].rank === bestScore.rank && scores[p].value > bestScore.value)) {
            bestScore = scores[p];
            winner = p;
        }
    }

    return winner;
}

function evaluateConfiguration(cards) {
    if (cards.length !== 3) return { rank: 99, value: 0 };

    const values = cards.map(c => c.numValue || convertValue(c.value)).sort((a, b) => a - b);
    const colors = cards.map(c => c.displayColor || c.color);
    const total = values.reduce((a, b) => a + b, 0);

    // 1. Total Mandate (AAA) - Three Aces
    if (values.every(v => v === 11)) return { rank: 1, value: 33 };

    const isConsecutive = checkConsecutive(cards);
    const sameColor = colors[0] === colors[1] && colors[1] === colors[2];
    const threeOfAKind = values[0] === values[1] && values[1] === values[2];

    // Check for pair
    let hasPair = false;
    let pairValue = 0;
    let kicker = 0;

    if (values[0] === values[1]) {
        hasPair = true;
        pairValue = values[0];
        kicker = values[2];
    } else if (values[1] === values[2]) {
        hasPair = true;
        pairValue = values[1];
        kicker = values[0];
    }

    // 2. Color Run (same color + consecutive)
    if (sameColor && isConsecutive) return { rank: 2, value: total };

    // 3. Unified Message (three identical numbers, not Aces)
    if (threeOfAKind && values[0] !== 11) return { rank: 3, value: total };

    // 4. Same Color (not consecutive)
    if (sameColor) return { rank: 4, value: total };

    // 5. Momentum (consecutive, different colors)
    if (isConsecutive) return { rank: 5, value: total };

    // 6. Party (pair - two identical numbers or double Ace)
    // Value encoding: pairValue * 100 + kicker (so pair comparison comes first, then kicker)
    if (hasPair) return { rank: 6, value: pairValue * 100 + kicker };

    // 7. Raw Pressure (sum of cards)
    return { rank: 7, value: total };
}

function checkConsecutive(cards) {
    const values = cards.map(c => c.numValue || convertValue(c.value)).sort((a, b) => a - b);
    if (values[1] - values[0] === 1 && values[2] - values[1] === 1) return true;
    if (values[0] === 2 && values[1] === 3 && values[2] === 11) return true;
    if (values[0] === 9 && values[1] === 10 && values[2] === 11) return true;
    return false;
}

function isTotalMandate(cards) {
    if (cards.length !== 3) return false;
    return cards.every(c => c.value === 'A' || c.numValue === 11);
}

function convertValue(v) {
    if (v === 'A') return 11;
    return parseInt(v) || 0;
}

function endTurn() {
    if (!hasPlayedCard) return;

    if (deck.length > 0) {
        players.indie.hand.push(deck.pop());
    }

    hasPlayedCard = false;
    updateDeckCount();
    updateButtons();

    setTimeout(() => aiTurn('left'), 500);
}

// ==========================================
// SMART AI SYSTEM - Strategic Decision Making
// ==========================================


function scoreMoveForAI(player, districtIdx, card, hand) {
    let score = 0;
    const district = districts[districtIdx];
    const currentCards = district.sides[player];
    const simulatedCards = [...currentCards, card];

    // Quick check: Does this win the round? (Lethal check)
    if (simulatedCards.length === 3) {
        // Calculate wins if we claim this
        const currentWins = players[player].score;
        if (currentWins >= 3) {
            // This is the 4th win -> Round Winner!
            score += 500;
        }
    }

    // 1. BO3 Context Awareness
    const myRoundWins = roundWins[player] || 0;

    // 2. Configuration strength evaluation
    if (simulatedCards.length === 3) {
        const config = evaluateConfiguration(simulatedCards);
        score += (8 - config.rank) * 25;
        score += config.value / 4;

        // Check if we can win vs opponents
        let canWin = true;
        let isCrushingWin = false;

        for (let op of PLAYERS.filter(p => p !== player)) {
            if (district.sides[op].length === 3) {
                const opConfig = evaluateConfiguration(district.sides[op]);
                if (opConfig.rank < config.rank ||
                    (opConfig.rank === config.rank && opConfig.value >= config.value)) {
                    canWin = false;
                    score -= 100; // Waste of cards if we lose
                    break;
                } else if (config.rank < opConfig.rank - 2) {
                    // We are beating them by a lot
                    isCrushingWin = true;
                }
            }
        }

        if (canWin) {
            score += 100; // Completing a winning district is huge

            // BO3 Tiebreaker 2: Best Combination (Lower is better)
            if (config.rank < bestCombinations[player]) {
                score += 30; // Improve stats
            }
        }
    } else {
        // Evaluate partial configuration potential
        const potential = evaluatePartialPotential(simulatedCards, hand);
        score += potential * 0.8;
    }

    // 3. Respond to opponent threats (Block/Steal)
    for (let op of PLAYERS.filter(p => p !== player)) {
        const opCards = district.sides[op];
        const opScore = players[op].score;

        if (opCards.length === 3) {
            // They are done, we are not. 
            // If their hand is weak (Rank 6/7), we want to contest this!
            if (simulatedCards.length < 3) {
                const opConfig = evaluateConfiguration(opCards);
                if (opConfig.rank >= 6) {
                    score += 15; // Vulnerable target
                }
            }
        } else if (opCards.length === 2) {
            // Threat alert! They are 1 card away.
            // If they are winning (3 pts), this is Critical Priority
            if (opScore >= 3) {
                score += 40; // MUST CONTEST
            } else {
                score += 15; // General pressure
            }

            // Try to block "obvious" combos (e.g. 2 of same color)
            const opColors = opCards.map(c => c.displayColor || c.color);
            if (opColors[0] === opColors[1]) {
                score += 10; // Break their color run/same color
            }
        }
    }

    // 4. Card synergy (Self)
    if (currentCards.length > 0) {
        const existingColors = currentCards.map(c => c.displayColor || c.color);
        const existingValues = currentCards.map(c => c.numValue || convertValue(c.value));
        const newColor = card.displayColor || card.color;
        const newValue = card.numValue || convertValue(card.value);
        const isNewAce = (newValue === 11);

        // Color synergy
        if (existingColors.includes(newColor)) {
            score += 15;
            // Run synergy check
            for (let v of existingValues) {
                if (Math.abs(v - newValue) === 1) score += 20; // Direct neighbor (4-5)
                else if (Math.abs(v - newValue) === 2) score += 10; // Gap fill (4-6)
            }
        }

        // Value synergy
        if (existingValues.includes(newValue)) {
            score += 25; // Pairs are strong foundation
        }

        // Ace Logic
        if (isNewAce) {
            const hasAce = existingValues.includes(11);
            if (hasAce) score += 50; // Double Ace -> Potential Total Mandate!
        }
    }

    // 5. Don't over-invest in lost causes
    if (currentCards.length >= 1) {
        for (let op of PLAYERS.filter(p => p !== player)) {
            const opCards = district.sides[op];
            if (opCards.length === 3) {
                const opConfig = evaluateConfiguration(opCards);
                if (opConfig.rank <= 3 && simulatedCards.length < 3) {
                    // They have a very strong hand, assume lost
                    score -= 50;
                }
            }
        }
    }

    return score;
}

// Helper function to evaluate potential of partial set
function evaluatePartialPotential(cards, hand) {
    if (cards.length === 0) return 0;
    if (cards.length === 3) return (8 - evaluateConfiguration(cards).rank) * 10;

    const colors = cards.map(c => c.displayColor || c.color);
    const values = cards.map(c => c.numValue || convertValue(c.value));
    let potential = 0;

    // Check for patterns
    const sameColor = colors.length >= 2 && colors[0] === colors[1];
    const sameValue = values.length >= 2 && values[0] === values[1];
    const aceCount = values.filter(v => v === 11).length;

    // 1. High Potential Hands
    if (aceCount >= 2) {
        potential = 95; // 2 Aces -> Total Mandate Potential!
    } else if (sameValue) {
        potential = 70; // 2 of a kind -> Unified Message (Rank 3) potential
    } else if (sameColor) {
        // Is it a Color Run?
        const sorted = [...values].sort((a, b) => a - b);
        const gap = sorted[sorted.length - 1] - sorted[0];
        if (gap <= 2) {
            potential = 85; // Color Run (Rank 2) potential!
        } else {
            potential = 55; // Just Same Color (Rank 4)
        }
    } else {
        // Run (Mixed Color)
        const sorted = [...values].sort((a, b) => a - b);
        const gap = sorted[sorted.length - 1] - sorted[0];
        if (gap <= 2) {
            potential = 50; // Momentum (Rank 5) potential
        }
    }

    // 2. High Value cards are always decent fallback
    const total = values.reduce((a, b) => a + b, 0);
    const avg = total / values.length;
    potential += avg;

    return potential;
}

function findBestMove(player) {
    const hand = players[player].hand;
    let bestMove = null;
    let bestScore = -Infinity;

    for (let cardIdx = 0; cardIdx < hand.length; cardIdx++) {
        const card = hand[cardIdx];

        for (let districtIdx = 0; districtIdx < districts.length; districtIdx++) {
            const district = districts[districtIdx];
            if (district.claimed || district.sides[player].length >= 3) continue;

            if (card.isCrisis) {
                const crisisOptions = findBestCrisisOption(player, districtIdx, hand);
                if (crisisOptions && crisisOptions.score > bestScore) {
                    bestScore = crisisOptions.score;
                    bestMove = {
                        cardIdx,
                        districtIdx,
                        isCrisis: true,
                        crisisColor: crisisOptions.color,
                        crisisValue: crisisOptions.value
                    };
                }
            } else {
                const score = scoreMoveForAI(player, districtIdx, card, hand);
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = { cardIdx, districtIdx, isCrisis: false };
                }
            }
        }
    }

    return bestMove;
}

function findBestCrisisOption(player, districtIdx, hand) {
    let bestOption = null;
    let bestScore = -Infinity;

    for (let color of COLORS) {
        for (let value = 2; value <= 10; value++) {
            const crisisCard = {
                color: color,
                value: value.toString(),
                numValue: value,
                displayColor: color,
                displayValue: value.toString()
            };

            const score = scoreMoveForAI(player, districtIdx, crisisCard, hand);
            if (score > bestScore) {
                bestScore = score;
                bestOption = { color, value: value.toString(), score };
            }
        }
    }

    return bestOption;
}

function aiTurn(player) {
    if (gameOver) return;

    currentPlayer = player;
    updateTurnIndicator();

    const hand = players[player].hand;
    if (hand.length === 0) {
        proceedToNextPlayer(player);
        return;
    }

    const bestMove = findBestMove(player);

    if (bestMove) {
        const district = districts[bestMove.districtIdx];
        const card = hand[bestMove.cardIdx];

        if (bestMove.isCrisis) {
            district.sides[player].push({
                ...card,
                displayColor: bestMove.crisisColor,
                displayValue: bestMove.crisisValue,
                color: bestMove.crisisColor,
                value: bestMove.crisisValue,
                numValue: parseInt(bestMove.crisisValue)
            });
            log(`${PLAYER_NAMES[player]} played Crisis as ${bestMove.crisisValue} of ${COLOR_NAMES[bestMove.crisisColor]} to District ${bestMove.districtIdx + 1}`, player);
        } else {
            district.sides[player].push({ ...card });
            const cardName = card.value === 'A' ? 'Ace' : card.value;
            log(`${PLAYER_NAMES[player]} played ${cardName} of ${COLOR_NAMES[card.color]} to District ${bestMove.districtIdx + 1}`, player);
        }

        hand.splice(bestMove.cardIdx, 1);
    }

    renderDistricts();

    setTimeout(() => {
        autoClaimDistricts(player);

        if (deck.length > 0) {
            players[player].hand.push(deck.pop());
        }

        updateDeckCount();
        proceedToNextPlayer(player);
    }, 400);
}

function proceedToNextPlayer(currentP) {
    if (gameOver) return;

    if (currentP === 'left') {
        setTimeout(() => aiTurn('right'), 500);
    } else {
        currentPlayer = 'indie';
        hasPlayedCard = false;
        selectedCard = null;
        updateTurnIndicator();
        updateButtons();
        renderHand();
        renderDistricts();
    }
}

function updateTurnIndicator() {
    const indicator = document.getElementById('turn-indicator');
    if (currentPlayer === 'indie') {
        indicator.textContent = 'Your Turn';
        indicator.style.background = 'linear-gradient(135deg, #7B1FA2, #9c27b0)';
    } else {
        indicator.textContent = `${PLAYER_NAMES[currentPlayer]}'s Turn`;
        indicator.style.background = currentPlayer === 'left'
            ? 'linear-gradient(135deg, #D32F2F, #ef5350)'
            : 'linear-gradient(135deg, #00ACC1, #26c6da)';
    }
}

function updateScores() {
    document.getElementById('left-score').textContent = players.left.score;
    document.getElementById('indie-score').textContent = players.indie.score;
    document.getElementById('right-score').textContent = players.right.score;
}

function updateDeckCount() {
    document.querySelector('#deck-count span').textContent = deck.length;
}

function checkWinCondition() {
    for (let p of PLAYERS) {
        if (players[p].score >= 3) {
            gameOver = true;
            handleRoundEnd(p);
            return;
        }
    }
}

function handleRoundEnd(roundWinner) {
    roundWins[roundWinner]++;

    log(`🏆 ${PLAYER_NAMES[roundWinner]} wins Round ${currentRound}!`, roundWinner);

    if (currentRound < 3) {
        // Show round end modal, then start next round
        showRoundEndModal(roundWinner);
    } else {
        // Game complete - determine final winner
        showFinalResults();
    }
}

function showRoundEndModal(roundWinner) {
    const modal = document.getElementById('game-over-modal');
    document.getElementById('winner-text').textContent =
        `Round ${currentRound} Complete!`;

    const winnerName = roundWinner === 'indie' ? 'You' : PLAYER_NAMES[roundWinner];
    document.getElementById('winner-message').innerHTML = `
        <strong>${winnerName}</strong> won this round!<br><br>
        <table style="margin: 0 auto; text-align: left; border-collapse: collapse; font-size: 0.9em;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.3);">
                <th style="padding: 3px 10px;">Player</th>
                <th style="padding: 3px 8px;">Rounds</th>
                <th style="padding: 3px 8px;">Districts</th>
            </tr>
            <tr>
                <td style="padding: 3px 10px;">LEFT</td>
                <td style="padding: 3px 8px; text-align: center;">${roundWins.left}</td>
                <td style="padding: 3px 8px; text-align: center;">${totalDistrictsWon.left}</td>
            </tr>
            <tr>
                <td style="padding: 3px 10px;"><strong>YOU</strong></td>
                <td style="padding: 3px 8px; text-align: center;">${roundWins.indie}</td>
                <td style="padding: 3px 8px; text-align: center;">${totalDistrictsWon.indie}</td>
            </tr>
            <tr>
                <td style="padding: 3px 10px;">RIGHT</td>
                <td style="padding: 3px 8px; text-align: center;">${roundWins.right}</td>
                <td style="padding: 3px 8px; text-align: center;">${totalDistrictsWon.right}</td>
            </tr>
        </table>
        <br>
        Next round: <strong>${PLAYER_NAMES[STARTING_PLAYERS[currentRound]]}</strong> starts first.
    `;

    // Change button to "Next Round"
    const btn = document.querySelector('.btn-restart');
    btn.textContent = 'NEXT ROUND';
    btn.onclick = startNextRound;

    modal.classList.add('active');
}

function startNextRound() {
    document.getElementById('game-over-modal').classList.remove('active');
    currentRound++;
    initRound(STARTING_PLAYERS[currentRound - 1]);

    // Reset button for final round
    const btn = document.querySelector('.btn-restart');
    btn.textContent = 'PLAY AGAIN';
    btn.onclick = restartGame;
}

function showFinalResults() {
    const modal = document.getElementById('game-over-modal');

    const configNames = {
        1: 'Total Mandate',
        2: 'Color Run',
        3: 'Unified Message',
        4: 'Same Color',
        5: 'Momentum',
        6: 'Party',
        7: 'Raw Pressure',
        99: 'None'
    };

    // Determine overall winner
    let maxWins = Math.max(roundWins.left, roundWins.indie, roundWins.right);
    let winners = PLAYERS.filter(p => roundWins[p] === maxWins);

    let finalWinner = null;
    let tiebreakMethod = '';

    if (winners.length === 1) {
        finalWinner = winners[0];
    } else {
        // TIEBREAKER 1: Total districts won
        let maxDistricts = Math.max(...winners.map(p => totalDistrictsWon[p]));
        let districtWinners = winners.filter(p => totalDistrictsWon[p] === maxDistricts);

        if (districtWinners.length === 1) {
            finalWinner = districtWinners[0];
            tiebreakMethod = 'by total districts won';
        } else {
            // TIEBREAKER 2: Best combination (lowest rank = better)
            let bestRank = Math.min(...districtWinners.map(p => bestCombinations[p]));
            let comboWinners = districtWinners.filter(p => bestCombinations[p] === bestRank);

            if (comboWinners.length === 1) {
                finalWinner = comboWinners[0];
                tiebreakMethod = 'by best combination';
            } else {
                // Still tied - no winner
                finalWinner = null;
            }
        }
    }

    if (finalWinner === 'indie') {
        document.getElementById('winner-text').textContent = '🎉 YOU WIN THE GAME!';
    } else if (finalWinner) {
        document.getElementById('winner-text').textContent = `${PLAYER_NAMES[finalWinner]} WINS THE GAME!`;
    } else {
        document.getElementById('winner-text').textContent = 'PERFECT TIE!';
    }

    document.getElementById('winner-message').innerHTML = `
        <strong>Final Results (Best of 3)</strong><br><br>
        <table style="margin: 0 auto; text-align: left; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.3);">
                <th style="padding: 5px 15px;">Player</th>
                <th style="padding: 5px 10px;">Rounds</th>
                <th style="padding: 5px 10px;">Districts</th>
                <th style="padding: 5px 10px;">Best Combo</th>
            </tr>
            <tr>
                <td style="padding: 5px 15px;">LEFT</td>
                <td style="padding: 5px 10px; text-align: center;">${roundWins.left}</td>
                <td style="padding: 5px 10px; text-align: center;">${totalDistrictsWon.left}</td>
                <td style="padding: 5px 10px;">${configNames[bestCombinations.left]}</td>
            </tr>
            <tr>
                <td style="padding: 5px 15px;"><strong>YOU</strong></td>
                <td style="padding: 5px 10px; text-align: center;">${roundWins.indie}</td>
                <td style="padding: 5px 10px; text-align: center;">${totalDistrictsWon.indie}</td>
                <td style="padding: 5px 10px;">${configNames[bestCombinations.indie]}</td>
            </tr>
            <tr>
                <td style="padding: 5px 15px;">RIGHT</td>
                <td style="padding: 5px 10px; text-align: center;">${roundWins.right}</td>
                <td style="padding: 5px 10px; text-align: center;">${totalDistrictsWon.right}</td>
                <td style="padding: 5px 10px;">${configNames[bestCombinations.right]}</td>
            </tr>
        </table>
        ${tiebreakMethod ? `<br><em>Winner decided ${tiebreakMethod}</em>` : ''}
    `;

    const btn = document.querySelector('.btn-restart');
    btn.textContent = 'PLAY AGAIN';
    btn.onclick = restartGame;

    modal.classList.add('active');
}

function updateRoundDisplay() {
    const roundEl = document.getElementById('round-indicator');
    if (roundEl) {
        const configShort = {
            1: 'AAA', 2: 'CR', 3: 'UM', 4: 'SC', 5: 'Mo', 6: 'Pa', 7: 'RP', 99: '-'
        };
        roundEl.innerHTML = `
            R${currentRound}/3 | 
            Wins: L:${roundWins.left} Y:${roundWins.indie} R:${roundWins.right} |
            Dist: L:${totalDistrictsWon.left} Y:${totalDistrictsWon.indie} R:${totalDistrictsWon.right}
        `;
    }
}

function restartGame() {
    document.getElementById('game-over-modal').classList.remove('active');
    initGame();
}

function log(message, player = '') {
    const logContent = document.getElementById('log-content');
    const entry = document.createElement('div');
    entry.className = `log-entry ${player}`;
    entry.textContent = message;
    logContent.insertBefore(entry, logContent.firstChild);
}

function clearLog() {
    document.getElementById('log-content').innerHTML = '';
}

// Drawer functions
function toggleDrawer(drawerId) {
    const drawer = document.getElementById(drawerId);
    drawer.classList.toggle('open');
}

// Combination history tracking
let comboHistory = [];

function updateStatsPanel() {
    const configNames = {
        1: 'Total Mandate',
        2: 'Color Run',
        3: 'Unified Message',
        4: 'Same Color',
        5: 'Momentum',
        6: 'Party',
        7: 'Raw Pressure',
        99: '-'
    };

    // Round wins
    document.getElementById('stats-left-rounds').textContent = roundWins.left;
    document.getElementById('stats-indie-rounds').textContent = roundWins.indie;
    document.getElementById('stats-right-rounds').textContent = roundWins.right;

    // Total districts
    document.getElementById('stats-left-districts').textContent = totalDistrictsWon.left;
    document.getElementById('stats-indie-districts').textContent = totalDistrictsWon.indie;
    document.getElementById('stats-right-districts').textContent = totalDistrictsWon.right;

    // Best combinations
    document.getElementById('stats-left-combo').textContent = configNames[bestCombinations.left];
    document.getElementById('stats-indie-combo').textContent = configNames[bestCombinations.indie];
    document.getElementById('stats-right-combo').textContent = configNames[bestCombinations.right];

    // Combo history
    const historyEl = document.getElementById('combo-history');
    if (comboHistory.length === 0) {
        historyEl.innerHTML = '<em>No combinations yet</em>';
    } else {
        historyEl.innerHTML = comboHistory.slice(-10).reverse().map(entry =>
            `<div class="combo-entry ${entry.player}-text">R${entry.round} D${entry.district}: ${entry.player === 'indie' ? 'YOU' : entry.player.toUpperCase()} - ${entry.combo}</div>`
        ).join('');
    }
}

function recordCombination(player, districtIdx, config) {
    const configNames = {
        1: 'Total Mandate',
        2: 'Color Run',
        3: 'Unified Message',
        4: 'Same Color',
        5: 'Momentum',
        6: 'Party',
        7: 'Raw Pressure'
    };

    comboHistory.push({
        round: currentRound,
        district: districtIdx + 1,
        player: player,
        combo: configNames[config.rank],
        rank: config.rank
    });

    updateStatsPanel();
}

// Event Listeners
document.getElementById('end-turn-btn').addEventListener('click', endTurn);

// Start the game
initGame();

