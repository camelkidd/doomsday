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
    wasCorrectedByOverride: false,
    isTutorialMode: false
};

const MAX_TIME_SECONDS = 3540; 
const screens = ['screen-difficulty', 'screen-settings', 'screen-game', 'screen-results'];

function openTutorial() {
    const modal = document.getElementById('modal-tutorial');
    const content = modal.querySelector('.modal-content');
    
    // 1. Reveal the modal
    modal.classList.remove('hidden');

    // 2. Force scroll to top using requestAnimationFrame for better reliability than setTimeout
    requestAnimationFrame(() => {
        if (content) {
            content.scrollTo({ top: 0, behavior: 'instant' });
            content.scrollTop = 0;
        }
    });
}

function closeTutorial() {
    document.getElementById('modal-tutorial').classList.add('hidden');
}

function startTutorialMode() {
    gameState.isTutorialMode = true;
    gameState.difficulty = 'easy'; 
    closeTutorial();
    
    gameState.currentIndex = 0;
    gameState.score = 0;
    gameState.correctedScore = 0;
    
    // July 4, 1776 walkthrough
    const tutorialDate = new Date(1776, 6, 4); 
    gameState.questions = [tutorialDate];
    
    showScreen('screen-game');
    loadQuestion();
    injectTutorialHints();
}

function injectTutorialHints() {
    if (!gameState.isTutorialMode) return;

    const scratchpad = document.getElementById('scratchpad-area');
    const labels = scratchpad.querySelectorAll('label');
    const inputs = scratchpad.querySelectorAll('input');

    const hints = {
        'Day/Month': 'A doomsday for July is the 4th, so this is 0)',
        'Century Anchor': '1700 doomsday is 0 (Sunday).',
        "12's": '76 / 12 = 6.',
        'Remainder': '76 % 12 = 4.',
        'Leap Years': '4 / 4 = 1.'
    };

    labels.forEach((label, i) => {
        const text = label.innerText;
        if (hints[text]) {
            const hintSpan = document.createElement('div');
            hintSpan.style.fontSize = "0.7rem";
            hintSpan.style.color = "#00bcd4";
            hintSpan.innerText = hints[text];
            label.parentNode.insertBefore(hintSpan, label.nextSibling);
        }
    });

    // Add a guide for the final answer
    const finalLabel = document.querySelector('label[for="final-answer"]') || document.getElementById('final-answer').previousElementSibling;
    const finalHint = document.createElement('div');
    finalHint.style.color = "#ff9800";
    finalHint.innerText = "Add all boxes: 0 + 0 + 6 + 4 + 1 = 11. 11 mod 7 = 4. 4th day is Thursday!";
    finalLabel.parentNode.insertBefore(finalHint, finalLabel.nextSibling);
}

// Update your existing loadQuestion to clean up tutorial mode if it was active
const originalLoadQuestion = loadQuestion;
loadQuestion = function() {
    originalLoadQuestion();
    if (gameState.isTutorialMode && gameState.currentIndex > 0) {
        gameState.isTutorialMode = false; // Turn off tutorial after the first custom question
    }
};

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
    
    if (gameState.questionTimes.length <= gameState.currentIndex) {
        gameState.currentQuestionTimeAccumulator = 0;
    }

    document.getElementById('attempt-counter').innerText = `Attempt: 1 / 3`;
    document.getElementById('question-counter').innerText = `Question: ${gameState.currentIndex + 1} / ${gameState.questions.length}`;
    
    // Reset Final Answer Input
    const finalInput = document.getElementById('final-answer');
    finalInput.value = "";
    finalInput.style.borderColor = "#555"; // Explicitly reset border color to default
    
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
        // Ensure new scratchpad inputs also start with the default border color
        div.innerHTML = `<label>${f}</label><input type="text" autocomplete="off" style="border-color: #555;">`;
        scratchpad.appendChild(div);
    });

    const firstInput = scratchpad.querySelector('input') || finalInput;
    firstInput.focus();
}

function submitAnswer() {
    if (gameState.timerEnabled) stopTimer();

    gameState.attempts++;
    document.getElementById('attempt-counter').innerText = `Attempt: ${gameState.attempts} / 3`;

    const date = gameState.questions[gameState.currentIndex];
    const targets = getDoomsdayComponents(date);
    
    const scratchpadArea = document.getElementById('scratchpad-area');
    const inputs = scratchpadArea.querySelectorAll('.input-block');
    
    const targetMap = {
        'Day/Month': targets.dayMonth,
        'Century Anchor': targets.centuryAnchor,
        "12's": targets.x12,
        'Remainder': targets.n,
        'Leap Years': targets.leaps,
        'Year Total': (targets.x12 + targets.n + targets.leaps + targets.centuryAnchor)
    };

    inputs.forEach(block => {
        const label = block.querySelector('label').innerText;
        const inputEl = block.querySelector('input');
        const targetValue = targetMap[label];

        if (targetValue !== undefined) {
            if (inputEl.value.trim() === "") {
                inputEl.style.borderColor = "#555"; // Keep neutral if empty
            } else if (isModEquivalent(inputEl.value, targetValue)) {
                inputEl.style.borderColor = "#4caf50"; 
            } else {
                inputEl.style.borderColor = "#f44336"; 
            }
        }
    });

    const finalInput = document.getElementById('final-answer');
    const correctDayName = dayNames[targets.final];
    const isCorrect = finalInput.value.trim().toLowerCase() === correctDayName.toLowerCase();

    const breakdown = document.getElementById('breakdown-container');
    const feedbackText = document.getElementById('feedback-text');
    const btnToggle = document.getElementById('btn-toggle-solution');
    const retryBtn = document.getElementById('btn-retry');

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
        finalInput.style.borderColor = "#4caf50"; // Turn green on success
        breakdown.classList.remove('hidden');
        btnToggle.innerText = "Hide Solution (Tab)";
        retryBtn.style.display = 'none';
        document.getElementById('btn-override').style.display = 'none';
        
        if (!gameState.wasRetried) gameState.score++;
        gameState.correctedScore++;
    } else {
        finalInput.style.borderColor = "#f44336"; // Turn red on failure
        if (gameState.attempts < 3) {
            feedbackText.innerText = "Incorrect.";
            feedbackText.style.color = "#f44336";
            retryBtn.style.display = 'inline-block';
            document.getElementById('btn-override').style.display = 'inline-block';
            breakdown.classList.add('hidden');
            btnToggle.innerText = "Show Solution (Tab)";
        } else {
            feedbackText.innerText = `Incorrect. It was ${correctDayName}.`;
            feedbackText.style.color = "#f44336";
            breakdown.classList.remove('hidden');
            btnToggle.innerText = "Hide Solution (Tab)";
            retryBtn.style.display = 'none';
            document.getElementById('btn-override').style.display = 'inline-block';
        }
    }
    document.getElementById('modal-feedback').classList.remove('hidden');
}

function nextQuestion() {
    // If we are currently peeking at the board, clean up the UI first
    if (document.getElementById('modal-feedback').classList.contains('clear-bg')) {
        toggleReviewMode();
    }
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
    const modal = document.getElementById('modal-feedback');
    if (modal.classList.contains('clear-bg')) {
        toggleReviewMode();
    }

    gameState.wasRetried = true;
    gameState.anyRetriesUsed = true;
    document.getElementById('attempt-counter').innerText = `Attempt: ${gameState.attempts + 1} / 3`;

    modal.classList.add('hidden');
    
    // Clear only the final answer
    const finalInput = document.getElementById('final-answer');
    finalInput.value = '';
    finalInput.style.borderColor = "#555"; // Reset border color
    
    // Focus the final answer for the retry
    finalInput.focus();
    
    if (gameState.timerEnabled) {
        gameState.questionStartTime = Date.now();
        startTimer();
    }
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
    const timeContainer = document.getElementById('final-time'); // Make sure this is targeted
    
    header.innerText = isTimeout ? "Game Over! You ran out of time!" : "Game Over";
    header.style.color = isTimeout ? "#f44336" : "#00bcd4";

    let resultsHTML = `Score: ${gameState.score} / ${gameState.questions.length}`;
    if (gameState.anyRetriesUsed) {
        resultsHTML += `<br>Corrected Score: ${gameState.correctedScore} / ${gameState.questions.length}`;
    }
    document.getElementById('final-score').innerHTML = resultsHTML;

    if (gameState.timerEnabled) {
        // Calculate average based on questions actually attempted
        const questionsAttempted = isTimeout ? Math.max(gameState.currentIndex, 1) : gameState.questions.length;
        const avg = gameState.totalTime / questionsAttempted;
        
        let timeHTML = `Total Time: ${formatTime(gameState.totalTime)}<br>`;
        timeHTML += `Average: ${avg.toFixed(1)}s / question`;

        // Breakdown for small question sets
        if (gameState.questions.length <= 7) {
            timeHTML += `<div style="margin-top: 20px; font-size: 0.9rem; color: #aaa; text-align: left; display: inline-block; border-top: 1px solid #444; padding-top: 10px; width: 100%;">`;
            timeHTML += `<strong style="color: #eee;">Review:</strong><br>`;
            
            gameState.questionTimes.forEach((t, i) => {
                const dateObj = gameState.questions[i];
                if (dateObj) {
                    const dateString = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    timeHTML += `<div style="display: flex; justify-content: space-between; gap: 20px;">
                                    <span>Q${i+1}: ${dateString}</span>
                                    <span>${t.toFixed(1)}s</span>
                                </div>`;
                }
            });
            timeHTML += `</div>`;
        }
        timeContainer.innerHTML = timeHTML; // Apply the HTML to the container
    } else {
        timeContainer.innerHTML = ""; // Clear if timer was off
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
    const quitModal = document.getElementById('modal-quit');
    const feedbackModal = document.getElementById('modal-feedback');
    const tutorialModal = document.getElementById('modal-tutorial');
    
    const isQuitOpen = !quitModal.classList.contains('hidden');
    const isFeedbackOpen = !feedbackModal.classList.contains('hidden');
    const isTutorialOpen = tutorialModal && !tutorialModal.classList.contains('hidden');

    // 1. Tutorial Modal Shortcuts
    if (isTutorialOpen) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeTutorial();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            startTutorialMode();
            return;
        }
    }

    // 2. Quit Modal Shortcuts
    if (isQuitOpen) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeQuitModal();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            location.reload(); 
            return;
        }
    }

    // 3. Difficulty Screen Shortcuts
    if (activeScreen === 'screen-difficulty') {
        if (e.key === '1') selectDifficulty('easy');
        if (e.key === '2') selectDifficulty('medium');
        if (e.key === '3') selectDifficulty('hard');
        if (e.key.toLowerCase() === 't') {
            openTutorial();
        }
    }

    // 4. Settings Screen Shortcuts
    if (activeScreen === 'screen-settings' && e.target.tagName !== 'INPUT') {
        if (e.key.toLowerCase() === 't') {
            const cb = document.getElementById('toggle-timer');
            cb.checked = !cb.checked;
        }
    }

    // 5. General Escape Key Logic
    if (e.key === 'Escape') {
        if (isFeedbackOpen) {
            toggleReviewMode();
        } else if (activeScreen === 'screen-settings') {
            showScreen('screen-difficulty');
        } else if (activeScreen === 'screen-game') {
            confirmQuit();
        }
    }

    // 6. General Enter Key Logic
    if (e.key === 'Enter') {
        if (!document.getElementById('modal-alert').classList.contains('hidden')) {
            closeAlert();
        } else if (isFeedbackOpen) {
            if (feedbackModal.classList.contains('clear-bg')) {
                toggleReviewMode(); 
            }
            nextQuestion();
        } else if (activeScreen === 'screen-game' && !isQuitOpen) {
            if (!document.getElementById('btn-submit').disabled) {
                submitAnswer();
            }
        } else if (activeScreen === 'screen-settings') {
            startGame();
        } else if (activeScreen === 'screen-results') {
            location.reload();
        }
    }

    // 7. Feedback Screen Specifics (Tab, Override, Space)
    if (isFeedbackOpen) {
        if (e.key === 'Tab') {
            e.preventDefault();
            toggleBreakdown();
        }
        if (e.key.toLowerCase() === 'o') {
            const overrideBtn = document.getElementById('btn-override');
            if (overrideBtn.style.display !== 'none') overrideScore();
        }
        if (e.key === ' ') {
            e.preventDefault(); 
            const isReviewing = feedbackModal.classList.contains('clear-bg');
            const retryBtn = isReviewing ? document.getElementById('btn-retry-review') : document.getElementById('btn-retry');
            if (retryBtn && retryBtn.style.display !== 'none') retryQuestion();
        }
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

function toggleBreakdown() {
    const breakdown = document.getElementById('breakdown-container');
    const btn = document.getElementById('btn-toggle-solution');
    const retryBtn = document.getElementById('btn-retry');
    const reviewRetryBtn = document.getElementById('btn-retry-review');
    
    breakdown.classList.toggle('hidden');
    
    if (!breakdown.classList.contains('hidden')) {
        btn.innerText = "Hide Solution (Tab)";
        // Lock out retries immediately
        if (retryBtn) retryBtn.style.display = 'none';
        if (reviewRetryBtn) reviewRetryBtn.style.display = 'none';
    } else {
        btn.innerText = "Show Solution (Tab)";
    }
}

function toggleReviewMode() {
    const modal = document.getElementById('modal-feedback');
    const content = document.getElementById('feedback-content');
    const reviewActions = document.getElementById('review-actions');
    const submitBtn = document.getElementById('btn-submit');
    const dateDisplay = document.getElementById('current-date-display');
    
    // Constants for syncing retry buttons
    const mainRetryBtn = document.getElementById('btn-retry');
    const reviewRetryBtn = document.getElementById('btn-retry-review');
    const feedbackText = document.getElementById('feedback-text').innerText;

    const isEnteringReview = !modal.classList.contains('clear-bg');

    // Toggle classes to "peek" at the game board
    modal.classList.toggle('clear-bg');
    content.classList.toggle('invisible');
    reviewActions.classList.toggle('hidden');

    if (isEnteringReview) {
        // Disable and gray out the submit button
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.3";
        submitBtn.style.cursor = "not-allowed";

        // Inject the Status Header (Correct/Incorrect)
        const isCorrect = feedbackText.includes("Correct");
        const statusColor = isCorrect ? "#4caf50" : "#f44336";
        const statusHeader = isCorrect ? "CORRECT" : "INCORRECT";
        
        const originalDateStr = gameState.questions[gameState.currentIndex].toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
        });

        dateDisplay.innerHTML = `
            <div id="review-header" style="color: ${statusColor}; font-size: 1.4rem; font-weight: bold; margin-bottom: 10px; letter-spacing: 2px;">
                ${statusHeader}
            </div>
            ${originalDateStr}
        `;

        // Sync the retry button visibility
        reviewRetryBtn.style.display = (mainRetryBtn.style.display !== 'none') ? 'inline-block' : 'none';
    } else {
        // Restore the submit button
        submitBtn.disabled = false;
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";

        // Restore original date display
        const date = gameState.questions[gameState.currentIndex];
        dateDisplay.innerText = date.toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
        });
    }
}

const toggleLimit = document.getElementById('toggle-present-only');
const check2100 = document.getElementById('check-2100');
const label2100 = document.getElementById('label-2100');

toggleLimit.addEventListener('change', () => {
    if (toggleLimit.checked) {
        check2100.checked = false;
        check2100.disabled = true;
        label2100.classList.add('disabled-option');
    } else {
        check2100.disabled = false;
        label2100.classList.remove('disabled-option');
    }
});

function isModEquivalent(input, target) {
    const val = parseInt(input);
    if (isNaN(val)) return false;
    
    // Standardize both numbers to the 0-6 range
    const standardizedInput = ((val % 7) + 7) % 7;
    const standardizedTarget = ((target % 7) + 7) % 7;
    
    return standardizedInput === standardizedTarget;
}

div.innerHTML = `<label>${f}</label><input type="text" autocomplete="off">`;