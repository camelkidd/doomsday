let gameState = {
    difficulty: '',
    questions: [],
    currentIndex: 0,
    score: 0,
    correctedScore: 0,
    wasRetried: false,
    anyRetriesUsed: false,
    currentBreakdown: ""
};

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
    const checkboxes = document.querySelectorAll('#century-selection input:checked:not(#toggle-present-only)');
    if (checkboxes.length === 0) return alert("Select at least one century!");

    const count = parseInt(document.getElementById('q-count').value);
    const centuries = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    gameState.questions = Array.from({ length: count }, () => generateRandomDate(centuries));
    gameState.currentIndex = 0;
    gameState.score = 0;
    gameState.correctedScore = 0;
    
    showScreen('screen-game');
    loadQuestion();
}

function generateRandomDate(centuries) {
    const limitToPresent = document.getElementById('toggle-present-only').checked;
    const today = new Date();
    let selectedDate = null;
    let attempts = 0;

    while (!selectedDate && attempts < 100) {
        attempts++;
        const yearBase = centuries[Math.floor(Math.random() * centuries.length)];
        let year = yearBase + Math.floor(Math.random() * 100);
        let month = Math.floor(Math.random() * 12);
        
        // Get last day of the specific month to avoid overflow (e.g., Feb 30 -> March 2)
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        let day = Math.floor(Math.random() * lastDayOfMonth) + 1;

        const generated = new Date(year, month, day);
        
        // Detailed check
        if (limitToPresent && yearBase === 2000) {
            if (generated <= today) {
                selectedDate = generated;
            }
        } else {
            selectedDate = generated;
        }
    }

    if (!selectedDate) {
        console.warn("Safety trigger: Could not find date in 100 tries. Using today.");
        selectedDate = new Date();
    }
    
    return selectedDate;
}

function loadQuestion() {
    gameState.wasRetried = false;
    document.getElementById('question-counter').innerText = 
        `Question: ${gameState.currentIndex + 1} / ${gameState.questions.length}`;

    const finalInput = document.getElementById('final-answer');
    finalInput.value = "";
    finalInput.style.borderColor = "#555"; 

    const date = gameState.questions[gameState.currentIndex];
    document.getElementById('current-date-display').innerText = date.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
    });
    
    const scratchpad = document.getElementById('scratchpad-area');
    scratchpad.innerHTML = '';
    
    let fields = [];
    if (gameState.difficulty === 'easy') {
        fields = ['Day/Month', 'Century Anchor', '12\'s', 'Remainder', 'Leap Years'];
    } else if (gameState.difficulty === 'medium') {
        fields = ['Day/Month', 'Year Total'];
    }

    fields.forEach(f => {
        const div = document.createElement('div');
        div.className = 'input-block';
        div.innerHTML = `<label>${f}</label><input type="text">`;
        scratchpad.appendChild(div);
    });

    const firstMathInput = scratchpad.querySelector('input');
    if (firstMathInput) firstMathInput.focus();
    else finalInput.focus();
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

    return {
        centuryAnchor: anchor, x12: x12, n: n, leaps: leaps,
        dayMonth: dayDiff < 0 ? dayDiff + 7 : dayDiff,
        final: date.getDay()
    };
}

function isCloseEnough(input, target) {
    input = input.toLowerCase().trim();
    target = target.toLowerCase();
    if (input === target) return true;
    let track = Array(target.length + 1).fill(null).map(() => Array(input.length + 1).fill(null));
    for (let i = 0; i <= target.length; i++) track[i][0] = i;
    for (let j = 0; j <= input.length; j++) track[0][j] = j;
    for (let i = 1; i <= target.length; i++) {
        for (let j = 1; j <= input.length; j++) {
            const indicator = target[i - 1] === input[j - 1] ? 0 : 1;
            track[i][j] = Math.min(track[i - 1][j] + 1, track[i][j - 1] + 1, track[i - 1][j - 1] + indicator);
        }
    }
    return track[target.length][input.length] <= 2;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

window.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const feedbackModal = document.getElementById('modal-feedback');
        const quitModal = document.getElementById('modal-quit');
        const resultsScreen = document.getElementById('screen-results');
        if (!feedbackModal.classList.contains('hidden')) {
            nextQuestion();
        } else if (quitModal.classList.contains('hidden') && !document.getElementById('screen-game').classList.contains('hidden')) {
            submitAnswer();
        } else if (!resultsScreen.classList.contains('hidden')){
            e.preventDefault(); 
            location.reload();
        }
    }
});

document.getElementById('toggle-present-only').addEventListener('change', function(e) {
    const century2200 = document.getElementById('check-2100');
    const label2200 = document.getElementById('label-2100');
    
    if (e.target.checked) {
        // Uncheck and disable 22nd century
        century2200.checked = false;
        label2200.classList.add('disabled-option');
    } else {
        label2200.classList.remove('disabled-option');
    }
});

function submitAnswer() {
    const date = gameState.questions[gameState.currentIndex];
    const targets = getDoomsdayComponents(date);
    const userText = document.getElementById('final-answer').value;
    const correctDayName = dayNames[targets.final];
    const isCorrect = userText.trim().toLowerCase() === correctDayName.toLowerCase();
    
    // Scratchpad visual feedback
    const inputs = document.querySelectorAll('#scratchpad-area input');
    inputs.forEach(input => {
        const val = parseInt(input.value);
        const label = input.closest('.input-block').querySelector('label').innerText.toLowerCase();
        let target = null;
        if (label.includes('12\'s')) target = targets.x12;
        else if (label.includes('remainder')) target = targets.n;
        else if (label.includes('4s')) target = targets.leaps;
        else if (label.includes('century')) target = targets.centuryAnchor;
        else if (label.includes('day/month')) target = targets.dayMonth;
        if (!isNaN(val)) input.style.borderColor = (val === target) ? "#4caf50" : "#f44336";
    });

    const sum = targets.centuryAnchor + targets.x12 + targets.n + targets.leaps + targets.dayMonth;
    document.getElementById('breakdown-container').innerHTML = `
        <div class="breakdown-box">
            <strong>Solution Breakdown:</strong><br>
            ${targets.centuryAnchor} (Anchor) + ${targets.x12} (12\'s) + ${targets.n} (Rem) + ${targets.leaps} (4s) + ${targets.dayMonth} (D/M)<br>
            Total: ${sum} → <strong>${correctDayName}</strong>
        </div>`;
    document.getElementById('breakdown-container').classList.remove('hidden');

    const feedbackText = document.getElementById('feedback-text');
    if (isCorrect) {
        feedbackText.innerText = "Correct!";
        feedbackText.style.color = "#4caf50";
        
        // LOGIC FIX: 
        // If it's a first-time success, increment primary score.
        // If it's a retry success, only increment corrected score.
        if (!gameState.wasRetried) {
            gameState.score++;
            gameState.correctedScore++;
        } else {
            gameState.correctedScore++;
        }
        
        document.getElementById('btn-retry').classList.add('hidden');
    } else {
        feedbackText.innerText = `Incorrect. It was ${correctDayName}.`;
        feedbackText.style.color = "#f44336";
        document.getElementById('btn-retry').classList.remove('hidden');
    }
    document.getElementById('modal-feedback').classList.remove('hidden');
}

function toggleBreakdown() { 
    document.getElementById('breakdown-container').classList.toggle('hidden'); 
}

function retryQuestion() { 
    gameState.wasRetried = true; 
    gameState.anyRetriesUsed = true; // Flag that a retry occurred
    document.getElementById('modal-feedback').classList.add('hidden'); 
    document.getElementById('final-answer').focus();
}

function nextQuestion() {
    document.getElementById('modal-feedback').classList.add('hidden');
    gameState.currentIndex++;
    if (gameState.currentIndex < gameState.questions.length) loadQuestion();
    else showResults();
}

function showResults() {
    showScreen('screen-results');
    let resultsHTML = `Score: ${gameState.score} / ${gameState.questions.length}`;
    
    // Only show corrected score if they actually retried something
    if (gameState.anyRetriesUsed) {
        resultsHTML += `<br>Corrected Score: ${gameState.correctedScore} / ${gameState.questions.length}`;
    }
    
    document.getElementById('final-score').innerHTML = resultsHTML;
}

function confirmQuit() { 
    document.getElementById('modal-quit').classList.remove('hidden'); 
}

function closeQuitModal() { 
    document.getElementById('modal-quit').classList.add('hidden'); 
}