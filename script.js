let gameState = {
    difficulty: '',
    questions: [],
    currentIndex: 0,
    score: 0,
    correctedScore: 0,
    wasRetried: false,
    anyRetriesUsed: false,
    currentBreakdown: "",
    attempts: 0,
    timerEnabled: false,
    startTime: null,
    totalTime: 0,
    timerInterval: null,
    questionTimes: [],
    questionStartTime: null, // Tracks start of current question session
    wasCorrectedByOverride: false
};

const MAX_TIME_SECONDS = 3540; 
const screens = ['screen-difficulty', 'screen-settings', 'screen-game', 'screen-results'];

function showScreen(id) {
    screens.forEach(s => document.getElementById(s).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function selectDifficulty(mode) {
    gameState.difficulty = mode;
    showScreen('screen-settings');
}

function startGame() {
    const checkboxes = document.querySelectorAll('.vertical-stack input[type="checkbox"]:checked');
    const centuryCheckboxes = Array.from(checkboxes).filter(cb => cb.value && !isNaN(cb.value));

    if (centuryCheckboxes.length === 0) {
        showAlert("Select at least one century!");
        return;
    }

    let rawCount = parseInt(document.getElementById('q-input').value) || 5;
    const count = Math.min(Math.max(rawCount, 1), 50);
    const centuries = centuryCheckboxes.map(cb => parseInt(cb.value));
    
    gameState.questions = Array.from({ length: count }, () => generateRandomDate(centuries));
    gameState.currentIndex = 0;
    gameState.score = 0;
    gameState.correctedScore = 0;
    gameState.totalTime = 0;
    gameState.questionTimes = [];
    gameState.anyRetriesUsed = false;
    
    gameState.timerEnabled = document.getElementById('toggle-timer').checked;
    
    if (gameState.timerEnabled) {
        document.getElementById('timer-display').classList.remove('hidden');
        document.getElementById('timer-display').innerText = "Time: 0";
        startTimer();
    } else {
        document.getElementById('timer-display').classList.add('hidden');
    }

    showScreen('screen-game');
    loadQuestion();
}

function formatTime(totalSeconds) {
    const total = Math.floor(totalSeconds);
    if (total < 60) return total.toString();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    gameState.questionStartTime = Date.now(); // Mark start of active answering
    
    gameState.timerInterval = setInterval(() => {
        const currentSession = (Date.now() - gameState.questionStartTime) / 1000;
        const displayTime = gameState.totalTime + currentSession;
        document.getElementById('timer-display').innerText = `Time: ${formatTime(displayTime)}`;

        if (displayTime >= MAX_TIME_SECONDS) {
            stopTimer();
            endGameByTimeout();
        }
    }, 1000); 
}

function stopTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
        // Save elapsed session time into the running total
        const sessionElapsed = (Date.now() - gameState.questionStartTime) / 1000;
        gameState.totalTime += sessionElapsed;
    }
}

function endGameByTimeout() {
    document.getElementById('modal-feedback').classList.add('hidden');
    document.getElementById('modal-quit').classList.add('hidden');
    showResults(true);
}

function loadQuestion() {
    gameState.wasRetried = false;
    gameState.attempts = 0;
    gameState.wasCorrectedByOverride = false;
    
    // We only reset the per-question timer bucket if we are moving to a NEW index
    if (gameState.questionTimes.length <= gameState.currentIndex) {
        gameState.currentQuestionTimeAccumulator = 0;
    }

    document.getElementById('attempt-counter').innerText = `Attempt: 1 / 3`;
    document.getElementById('question-counter').innerText = `Question: ${gameState.currentIndex + 1} / ${gameState.questions.length}`;
    
    const finalInput = document.getElementById('final-answer');
    finalInput.value = "";
    
    const date = gameState.questions[gameState.currentIndex];
    document.getElementById('current-date-display').innerText = date.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
    });
    
    const scratchpad = document.getElementById('scratchpad-area');
    scratchpad.innerHTML = '';
    let fields = [];
    if (gameState.difficulty === 'easy') fields = ['Day/Month', 'Century Anchor', '12\'s', 'Remainder', 'Leap Years'];
    else if (gameState.difficulty === 'medium') fields = ['Day/Month', 'Year Total'];

    fields.forEach(f => {
        const div = document.createElement('div');
        div.className = 'input-block';
        div.innerHTML = `<label>${f}</label><input type="text">`;
        scratchpad.appendChild(div);
    });

    const firstInput = scratchpad.querySelector('input') || finalInput;
    firstInput.focus();
}

function submitAnswer() {
    // STOP timer while looking at feedback
    if (gameState.timerEnabled) stopTimer();

    gameState.attempts++;
    document.getElementById('attempt-counter').innerText = `Attempt: ${gameState.attempts} / 3`;

    const date = gameState.questions[gameState.currentIndex];
    const targets = getDoomsdayComponents(date);
    const finalInput = document.getElementById('final-answer');
    const correctDayName = dayNames[targets.final];
    const isCorrect = finalInput.value.trim().toLowerCase() === correctDayName.toLowerCase();

    const breakdown = document.getElementById('breakdown-container');
    const feedbackText = document.getElementById('feedback-text');

    breakdown.innerHTML = `
        <div class="breakdown-box">
            <strong>Target:</strong> ${correctDayName}<br>
            <strong>Century Anchor:</strong> ${targets.centuryAnchor}<br>
            <strong>Year Calc:</strong> (12s: ${targets.x12}) + (Rem: ${targets.n}) + (Leaps: ${targets.leaps})<br>
            <strong>Month Offset:</strong> ${targets.dayMonth}
        </div>
    `;

    if (isCorrect) {
        feedbackText.innerText = "Correct!";
        feedbackText.style.color = "#4caf50";
        breakdown.classList.remove('hidden');
        document.getElementById('btn-retry').style.display = 'none';
        document.getElementById('btn-override').style.display = 'none';
        
        if (!gameState.wasRetried) gameState.score++;
        gameState.correctedScore++;
    } else {
        if (gameState.attempts < 3) {
            feedbackText.innerText = "Incorrect.";
            feedbackText.style.color = "#f44336";
            document.getElementById('btn-retry').style.display = 'inline-block';
            document.getElementById('btn-override').style.display = 'inline-block';
            breakdown.classList.add('hidden');
        } else {
            feedbackText.innerText = `Incorrect. It was ${correctDayName}.`;
            feedbackText.style.color = "#f44336";
            document.getElementById('btn-retry').style.display = 'none';
            document.getElementById('btn-override').style.display = 'inline-block';
            breakdown.classList.remove('hidden');
        }
    }
    document.getElementById('modal-feedback').classList.remove('hidden');
}

function nextQuestion() {
    // Log time for this specific question (which was accumulated into totalTime upon stopTimer)
    const lastSession = (gameState.totalTime - (gameState.questionTimes.reduce((a, b) => a + b, 0) || 0));
    gameState.questionTimes.push(lastSession);

    document.getElementById('modal-feedback').classList.add('hidden');
    gameState.currentIndex++;
    if (gameState.currentIndex < gameState.questions.length) {
        if (gameState.timerEnabled) startTimer();
        loadQuestion();
    } else {
        showResults();
    }
}

function retryQuestion() {
    gameState.wasRetried = true;
    gameState.anyRetriesUsed = true;
    document.getElementById('final-answer').value = "";
    document.getElementById('modal-feedback').classList.add('hidden');
    if (gameState.timerEnabled) startTimer(); // Resume timer on retry
    document.getElementById('final-answer').focus();
}

function overrideScore() {
    if (gameState.wasCorrectedByOverride) return;
    gameState.score++;
    gameState.correctedScore++;
    gameState.wasCorrectedByOverride = true;
    document.getElementById('feedback-text').innerText = "Correct (Overridden)";
    document.getElementById('feedback-text').style.color = "#4caf50";
    document.getElementById('btn-retry').style.display = 'none';
    document.getElementById('btn-override').style.display = 'none';
    document.getElementById('breakdown-container').classList.remove('hidden');
}

function showResults(isTimeout = false) {
    showScreen('screen-results');
    const header = document.getElementById('results-header');
    header.innerText = isTimeout ? "Game Over! You ran out of time!" : "Game Over";
    header.style.color = isTimeout ? "#f44336" : "#00bcd4";

    let resultsHTML = `Score: ${gameState.score} / ${gameState.questions.length}`;
    if (gameState.anyRetriesUsed) {
        resultsHTML += `<br>Corrected Score: ${gameState.correctedScore} / ${gameState.questions.length}`;
    }
    document.getElementById('final-score').innerHTML = resultsHTML;

    const timeContainer = document.getElementById('final-time');
    if (gameState.timerEnabled) {
        const avg = gameState.totalTime / (isTimeout ? Math.max(gameState.currentIndex, 1) : gameState.questions.length);
        
        // Structure: Total Time <br> Average <br> [Breakdown]
        let timeHTML = `Total Time: ${formatTime(gameState.totalTime)}<br>`;
        timeHTML += `Average: ${avg.toFixed(1)}s / question`;

        if (gameState.questions.length <= 7) {
            timeHTML += `<div style="margin-top: 20px; font-size: 0.9rem; color: #aaa; text-align: left; display: inline-block; border-top: 1px solid #444; padding-top: 10px; width: 100%;">`;
            timeHTML += `<strong style="color: #eee;">Time per Question:</strong><br>`;
            gameState.questionTimes.forEach((t, i) => {
                timeHTML += `Q${i+1}: ${t.toFixed(1)}s<br>`;
            });
            timeHTML += `</div>`;
        }
        timeContainer.innerHTML = timeHTML;
    } else {
        timeContainer.innerHTML = "";
    }
}

function getDoomsdayComponents(date) {
    const year = date.getFullYear();
    const YY = year % 100;
    const century = Math.floor(year / 100) * 100;
    const anchors = { 1700: 0, 1800: 5, 1900: 3, 2000: 2, 2100: 0 };
    const anchor = anchors[century];
    const x12 = Math.floor(YY / 12);
    const n = YY % 12;
    const leaps = Math.floor(n / 4);
    const m = date.getMonth() + 1;
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const doomsdays = [0, isLeap ? 4 : 3, isLeap ? 29 : 28, 0, 4, 9, 6, 11, 8, 5, 10, 7, 12];
    const monthAnchor = doomsdays[m];
    const dayDiff = (date.getDate() - monthAnchor) % 7;
    return { centuryAnchor: anchor, x12: x12, n: n, leaps: leaps, dayMonth: dayDiff < 0 ? dayDiff + 7 : dayDiff, final: date.getDay() };
}

function generateRandomDate(centuries) {
    const limitToPresent = document.getElementById('toggle-present-only').checked;
    const today = new Date();
    let selectedDate = null;
    while (!selectedDate) {
        const yearBase = centuries[Math.floor(Math.random() * centuries.length)];
        let year = yearBase + Math.floor(Math.random() * 100);
        let month = Math.floor(Math.random() * 12);
        const lastDay = new Date(year, month + 1, 0).getDate();
        let day = Math.floor(Math.random() * lastDay) + 1;
        const gen = new Date(year, month, day);
        if (!limitToPresent || gen <= today) selectedDate = gen;
    }
    return selectedDate;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Key Handling
window.addEventListener('keydown', function(e) {
    const activeScreen = screens.find(id => !document.getElementById(id).classList.contains('hidden'));
    const feedbackModal = document.getElementById('modal-feedback');
    const isFeedbackOpen = !feedbackModal.classList.contains('hidden');
    const retryBtn = document.getElementById('btn-retry');
    const isRetryVisible = retryBtn.style.display !== 'none';

    if (activeScreen === 'screen-difficulty') {
        if (e.key === '1') selectDifficulty('easy');
        if (e.key === '2') selectDifficulty('medium');
        if (e.key === '3') selectDifficulty('hard');
    }

    if (activeScreen === 'screen-settings' && e.target.tagName !== 'INPUT') {
        if (e.key.toLowerCase() === 't') {
            const cb = document.getElementById('toggle-timer');
            cb.checked = !cb.checked;
        }
    }

    if (e.key === ' ') {
        // If feedback is open...
        if (isFeedbackOpen) {
            e.preventDefault(); // Stop page from jumping
            if (isRetryVisible) {
                retryQuestion();
            } else {
                nextQuestion(); // Space acts as 'Continue' if you can't retry
            }
        } 
        // If in game but feedback is NOT open (Submitting the answer)
        else if (activeScreen === 'screen-game') {
            // Only allow Space to submit if not currently typing in a text field
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault();
                submitAnswer();
            }
        }
    }

    if (e.key === 'Enter') {
        if (!document.getElementById('modal-alert').classList.contains('hidden')) closeAlert();
        else if (isFeedbackOpen) nextQuestion();
        else if (activeScreen === 'screen-game') submitAnswer();
        else if (activeScreen === 'screen-settings') startGame();
        else if (activeScreen === 'screen-results') location.reload();
    }
});

// Slider & Clamping Logic
const qSlider = document.getElementById('q-count');
const qInput = document.getElementById('q-input');
if(qSlider && qInput) {
    qSlider.addEventListener('input', () => qInput.value = qSlider.value);
    qInput.addEventListener('input', (e) => {
        let val = parseInt(e.target.value);
        if (val > 50) { val = 50; qInput.value = 50; }
        if (!isNaN(val)) qSlider.value = val;
    });
}

function showAlert(message) {
    document.getElementById('alert-message').innerText = message;
    document.getElementById('modal-alert').classList.remove('hidden');
}
function closeAlert() { document.getElementById('modal-alert').classList.add('hidden'); }
function confirmQuit() { stopTimer(); document.getElementById('modal-quit').classList.remove('hidden'); }
function closeQuitModal() { if (gameState.timerEnabled) startTimer(); document.getElementById('modal-quit').classList.add('hidden'); }
function toggleBreakdown() { document.getElementById('breakdown-container').classList.toggle('hidden'); }