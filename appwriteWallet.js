// Appwrite Configuration
const { Client, Account, Databases, Avatars, ID, Query } = Appwrite;

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('6a66d7790012b357e38e');

const account = new Account(client);
const databases = new Databases(client);
const avatars = new Avatars(client);

const DATABASE_ID = 'echoes_wallet';
const COLLECTION_TXN = 'transactions';

let currentUser = null;
let isSignup = false;
let allTransactions = [];
let currentBalance = 0;

let turnTimer = null;
let timeLeft = 15;
let missedTurnsCount = 0;
let ludoEngineInstance = null;
let isSoundEnabled = true;

// Web Audio API Synth Engine for SFX
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (!isSoundEnabled) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'dice') {
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'win') {
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
            osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
            osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.4);
        }
    } catch (e) {
        console.log("Audio play error", e);
    }
}

function triggerVibration() {
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    const btn = document.getElementById('soundToggleBtn');
    if (btn) btn.textContent = isSoundEnabled ? '🔊' : '🔇';
}

async function checkSession() {
    try {
        currentUser = await account.get();
        document.getElementById('userEmailDisplay').textContent = currentUser.email.split('@')[0];
        document.getElementById('userAvatar').src = avatars.getInitials(currentUser.email);

        document.getElementById('authBox').classList.remove('active');
        document.getElementById('walletBox').classList.add('active');
        loadTransactions();
        showView('home');
        checkReferralBonus();
    } catch (err) {
        document.getElementById('authBox').classList.add('active');
        document.getElementById('walletBox').classList.remove('active');
    }
}

async function checkReferralBonus() {
    const urlParams = new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref');
    if (refId && currentUser && refId !== currentUser.$id) {
        const hasClaimedRef = localStorage.getItem(`ref_claimed_${currentUser.$id}`);
        if (!hasClaimedRef) {
            localStorage.setItem(`ref_claimed_${currentUser.$id}`, 'true');
            await addTransactionRecord(`🎁 Referral Join Bonus`, 50, 'income');
        }
    }
}

function toggleAuthMode() {
    isSignup = !isSignup;
    document.getElementById('authTitle').textContent = isSignup ? "Naya Account Banayein" : "Login Karein";
    document.getElementById('authSubmitBtn').textContent = isSignup ? "Signup" : "Login";
    document.getElementById('toggleAuthBtn').textContent = isSignup ? "Pehle se account hai? Login" : "Naya Account Banayein";
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    try {
        if (isSignup) {
            await account.create(ID.unique(), email, password);
            alert("Account ban gaya! Login ho raha hai...");
        }
        await account.createEmailPasswordSession(email, password);
        checkSession();
    } catch (err) {
        alert("Error: " + err.message);
    }
});

async function logout() {
    try {
        await account.deleteSession('current');
        currentUser = null;
        checkSession();
    } catch (err) {
        alert("Logout failed: " + err.message);
    }
}

function showView(viewName) {
    const views = ['home', 'arena', 'addMoney', 'history', 'leaderboard'];
    views.forEach(v => {
        const el = document.getElementById('view' + v.charAt(0).toUpperCase() + v.slice(1));
        if (el) el.style.display = (v === viewName) ? 'block' : 'none';
    });

    const backBtn = document.getElementById('backHomeBtn');
    if (backBtn) backBtn.style.display = (viewName === 'home') ? 'none' : 'block';
    
    if (viewName === 'arena' && !ludoEngineInstance && window.LudoEngine) {
        setTimeout(() => {
            ludoEngineInstance = new window.LudoEngine('ludoBoard');
        }, 100);
    }
}

async function loadTransactions() {
    if (!currentUser) return;
    try {
        const response = await databases.listDocuments(
            DATABASE_ID,
            COLLECTION_TXN,
            [Query.equal('userId', currentUser.$id)]
        );
        allTransactions = response.documents;
        renderTransactions();
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

function renderTransactions() {
    const txnListEl = document.getElementById('txnList');
    if (!txnListEl) return;
    txnListEl.innerHTML = '';
    let income = 0, expense = 0;

    allTransactions.forEach(txn => {
        const amt = parseFloat(txn.amount);
        if (txn.type === 'income') {
            income += amt;
        } else {
            expense += amt;
        }

        const li = document.createElement('li');
        li.className = `txn-item ${txn.type}`;
        li.innerHTML = `
            <div class="txn-title">${txn.title}</div>
            <span class="txn-amount ${txn.type === 'income' ? 'income-text' : 'expense-text'}">
                ${txn.type === 'income' ? '+' : '-'}₹${amt.toFixed(2)}
            </span>
        `;
        txnListEl.appendChild(li);
    });

    currentBalance = Math.max(0, income - expense);
    document.getElementById('totalBalance').textContent = `₹${currentBalance.toFixed(2)}`;
    document.getElementById('totalIncome').textContent = `+₹${income.toFixed(2)}`;
    document.getElementById('totalExpense').textContent = `-₹${expense.toFixed(2)}`;

    updateVipTier(expense);
}

function updateVipTier(totalSpent) {
    const vipBadge = document.getElementById('vipTierDisplay');
    if (!vipBadge) return;
    if (totalSpent >= 1000) {
        vipBadge.textContent = "🥇 VIP Level 3 (Gold)";
        vipBadge.style.color = "#facc15";
    } else if (totalSpent >= 200) {
        vipBadge.textContent = "🥈 VIP Level 2 (Silver)";
        vipBadge.style.color = "#e2e8f0";
    } else {
        vipBadge.textContent = "👑 VIP Level 1 (Bronze)";
        vipBadge.style.color = "#cd7f32";
    }
}

document.getElementById('txnForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('txnAmount').value);

    if (isNaN(amount) || amount < 10) {
        alert("Minimum Deposit ₹10 required!");
        return;
    }

    let userAction = confirm(`Deposit ₹${amount} in your wallet?`);

    if (userAction) {
        await addTransactionRecord(`📱 Direct Wallet Deposit`, amount, 'income');
        playSound('win');
        alert(`Deposit Successful! ₹${amount} aapke wallet me jod diye gaye hain.`);
        document.getElementById('txnAmount').value = '';
        showView('home');
    }
});

document.getElementById('withdrawForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const upi = document.getElementById('withdrawUpi').value;
    const amount = parseFloat(document.getElementById('withdrawAmount').value);

    if (amount > currentBalance) {
        alert("Invalid Balance! Fraudulent transaction blocked.");
        return;
    }

    await addTransactionRecord(`💸 Withdrawal Payout (${upi})`, amount, 'expense');
    
    alert("Withdrawal Request Submitted Successfully!");
    document.getElementById('withdrawAmount').value = '';
    showView('home');
});

async function addTransactionRecord(title, amount, type) {
    if (!currentUser) return;
    try {
        await databases.createDocument(
            DATABASE_ID,
            COLLECTION_TXN,
            ID.unique(),
            { userId: currentUser.$id, title: title, amount: amount, type: type }
        );
        await loadTransactions();
    } catch (err) {
        alert("Transaction error: " + err.message);
    }
}

function openSpinModal() { document.getElementById('spinModal').style.display = 'flex'; }
function closeSpinModal() { document.getElementById('spinModal').style.display = 'none'; }

function spinWheel() {
    const wheel = document.getElementById('wheel');
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = true;

    playSound('dice');
    triggerVibration();

    const randomDegrees = 1440 + Math.floor(Math.random() * 360);
    wheel.style.transform = `rotate(${randomDegrees}deg)`;

    setTimeout(async () => {
        const prizes = [5, 2, 10, 1, 20, 0];
        const wonAmount = prizes[Math.floor(Math.random() * prizes.length)];
        
        if (wonAmount > 0) {
            playSound('win');
            if (window.confetti) confetti();
            alert(`🎉 Mubark ho! Aapne ₹${wonAmount} Bonus Cash jeeta!`);
            await addTransactionRecord(`🎡 Lucky Spin Bonus`, wonAmount, 'income');
        } else {
            alert("Better luck next time!");
        }
        
        spinBtn.disabled = false;
        closeSpinModal();
    }, 3200);
}

function openScratchModal() {
    document.getElementById('scratchModal').style.display = 'flex';
    document.getElementById('scratchCover').classList.remove('scratched');
}
function closeScratchModal() { document.getElementById('scratchModal').style.display = 'none'; }

async function revealScratchCard() {
    const cover = document.getElementById('scratchCover');
    if (cover.classList.contains('scratched')) return;

    cover.classList.add('scratched');
    playSound('win');
    if (window.confetti) confetti();

    const scratchRewards = [5, 10, 15, 20, 25];
    const reward = scratchRewards[Math.floor(Math.random() * scratchRewards.length)];
    document.getElementById('scratchRewardText').textContent = `₹${reward} Cash!`;
    
    await addTransactionRecord(`🎫 Scratch Card Reward`, reward, 'income');
}

async function claimDailyStreak() {
    const btn = document.getElementById('claimStreakBtn');
    btn.disabled = true;
    btn.textContent = "Bonus Claimed ✓";
    playSound('win');
    await addTransactionRecord(`🔥 Daily Login Bonus`, 1, 'income');
    alert("Day 1 Login Bonus ₹1 added to your wallet!");
}

function shareOnWhatsApp() {
    const referralLink = `${window.location.origin}?ref=${currentUser ? currentUser.$id : 'LUDO'}`;
    const text = `🎲 Ludo Pro League par mere saath Ludo khelo aur paao ₹50 Free Bonus Cash! Instant withdrawal to UPI. Direct Join Link: ${referralLink}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function sendChat(msg) {
    playSound('dice');
    const container = document.getElementById('floatingEmojiContainer');
    if (container) {
        const span = document.createElement('div');
        span.className = 'floating-emoji-container';
        span.textContent = msg;
        container.appendChild(span);
        setTimeout(() => span.remove(), 1500);
    }
}

async function startMatch() {
    const bet = parseFloat(document.getElementById('betAmountSelect').value);
    
    if (currentBalance < bet) {
        alert("Balance insufficient! Match Join nahi ho sakta.");
        showView('addMoney');
        return;
    }

    await addTransactionRecord(`🎲 Match Entry Fee`, bet, 'expense');
    document.getElementById('rollDiceBtn').disabled = false;
    missedTurnsCount = 0;
    resetTimer();
}

function resetTimer() {
    clearInterval(turnTimer);
    timeLeft = 15;
    document.getElementById('timerDisplay').textContent = `${timeLeft}s`;

    turnTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('timerDisplay').textContent = `${timeLeft}s`;
        
        if (timeLeft <= 0) {
            clearInterval(turnTimer);
            miss2 = missedTurnsCount++;
            
            if (missedTurnsCount >= 3) {
                alert("⚠️ Anti-Cheat Rule: Aapne lagataar 3 turns miss kar diye! Game Forfeited (Loss).");
                document.getElementById('rollDiceBtn').disabled = true;
                showView('home');
            } else {
                alert(`Time out! Turn missed (${missedTurnsCount}/3 warnings)`);
                resetTimer();
            }
        }
    }, 1000);
}

function handleDiceRoll() {
    playSound('dice');
    triggerVibration();
    if (ludoEngineInstance) {
        ludoEngineInstance.rollDice((val) => {
            missedTurnsCount = 0;
            resetTimer();
        });
    }
}

checkSession();
            
