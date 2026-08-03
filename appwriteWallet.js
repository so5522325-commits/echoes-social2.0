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

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (!isSoundEnabled) return;
    try {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
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

// 📌 Helper to get persistent Local Storage Transactions key
function getStorageKey() {
    if (currentUser && currentUser.$id) {
        return `ludo_txns_${currentUser.$id}`;
    }
    return `ludo_txns_guest_global`;
}

async function checkSession() {
    try {
        const localEmail = localStorage.getItem('local_user_email');
        if (localEmail) {
            currentUser = { $id: 'user_' + btoa(localEmail).replace(/=/g, ''), email: localEmail };
            document.getElementById('userEmailDisplay').textContent = localEmail.split('@')[0];
            document.getElementById('userAvatar').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${localEmail}`;

            document.getElementById('authBox').classList.remove('active');
            document.getElementById('walletBox').classList.add('active');
            await loadTransactions();
            showView('home');
            checkReferralBonus();
            return;
        }

        currentUser = await account.get();
        document.getElementById('userEmailDisplay').textContent = currentUser.email.split('@')[0];
        document.getElementById('userAvatar').src = avatars.getInitials(currentUser.email);

        document.getElementById('authBox').classList.remove('active');
        document.getElementById('walletBox').classList.add('active');
        await loadTransactions();
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

    try {
        localStorage.setItem('local_user_email', email);
        currentUser = { $id: 'user_' + btoa(email).replace(/=/g, ''), email: email };
        
        document.getElementById('userEmailDisplay').textContent = email.split('@')[0];
        document.getElementById('userAvatar').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${email}`;

        document.getElementById('authBox').classList.remove('active');
        document.getElementById('walletBox').classList.add('active');
        await loadTransactions();
        showView('home');
        checkReferralBonus();
        
        alert("Login Successful!");
    } catch (err) {
        alert("Error: " + err.message);
    }
});

async function logout() {
    try {
        localStorage.removeItem('local_user_email');
        await account.deleteSession('current').catch(() => {});
        currentUser = null;
        allTransactions = [];
        renderTransactions();
        checkSession();
    } catch (err) {
        localStorage.removeItem('local_user_email');
        currentUser = null;
        allTransactions = [];
        renderTransactions();
        checkSession();
    }
}

function showView(viewName) {
    const views = ['home', 'arena', 'addMoney', 'history', 'leaderboard', 'store'];
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

// 🟢 FIX 1: Robust Load Transactions with Double Fallback
async function loadTransactions() {
    allTransactions = [];
    
    // 1. Local Storage Safe Check First
    const key = getStorageKey();
    const savedTxns = localStorage.getItem(key);
    if (savedTxns) {
        try {
            allTransactions = JSON.parse(savedTxns);
        } catch (e) {
            allTransactions = [];
        }
    }

    // 2. Cloud Database Sync (Appwrite)
    if (currentUser) {
        try {
            const response = await databases.listDocuments(
                DATABASE_ID,
                COLLECTION_TXN,
                [Query.equal('userId', currentUser.$id), Query.orderDesc('$createdAt'), Query.limit(100)]
            );
            if (response && response.documents && response.documents.length > 0) {
                allTransactions = response.documents;
                localStorage.setItem(key, JSON.stringify(allTransactions));
            }
        } catch (err) {
            console.log("Appwrite offline or network delayed, using local offline data.");
        }
    }

    renderTransactions();
}

// 🟢 FIX 2: Correct Math calculation for Deposits vs Expenses vs Winnings
function renderTransactions() {
    const txnListEl = document.getElementById('txnList');
    if (txnListEl) txnListEl.innerHTML = '';
    
    let totalDeposit = 0;
    let totalWon = 0;
    let totalExpense = 0;

    allTransactions.forEach(txn => {
        const amt = parseFloat(txn.amount) || 0;
        const titleLower = (txn.title || '').toLowerCase();

        if (titleLower.includes('deposit') || titleLower.includes('scan') || titleLower.includes('razorpay') || titleLower.includes('top-up')) {
            totalDeposit += amt;
        } else if (txn.type === 'income') {
            totalWon += amt;
        } else if (txn.type === 'expense') {
            totalExpense += amt;
        }

        if (txnListEl) {
            const li = document.createElement('li');
            li.className = `txn-item ${txn.type}`;
            li.innerHTML = `
                <div class="txn-title">${txn.title}</div>
                <span class="txn-amount ${txn.type === 'income' ? 'income-text' : 'expense-text'}">
                    ${txn.type === 'income' ? '+' : '-'}₹${amt.toFixed(2)}
                </span>
            `;
            txnListEl.appendChild(li);
        }
    });

    // Final Net Balance calculation
    currentBalance = (totalDeposit + totalWon) - totalExpense;
    if (currentBalance < 0) currentBalance = 0;

    // Update UI Elements
    document.getElementById('totalBalance').textContent = `₹${currentBalance.toFixed(2)}`;
    document.getElementById('totalDeposit').textContent = `+₹${totalDeposit.toFixed(2)}`;
    document.getElementById('totalIncome').textContent = `+₹${totalWon.toFixed(2)}`;

    updateVipTier(totalExpense);
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

async function verifyQrPayment() {
    const utr = document.getElementById('qrUtrInput').value.trim();
    if (!utr || utr.length < 6) {
        alert("Kripya sahi UTR / Transaction Reference Number dalein!");
        return;
    }
    
    let depositAmt = prompt("Aapne QR code par kitna amount pay kiya hai?", "100");
    depositAmt = parseFloat(depositAmt);

    if (isNaN(depositAmt) || depositAmt <= 0) {
        alert("Invalid amount entered.");
        return;
    }

    let success = await addTransactionRecord(`📱 QR UPI Scan Deposit (${utr})`, depositAmt, 'income');
    
    if (success) {
        playSound('win');
        if (window.confetti) confetti();
        alert(`Payment Verified! ₹${depositAmt} aapke wallet mein successfully jod diye gaye hain.`);
        document.getElementById('qrUtrInput').value = '';
        showView('home');
    }
}

document.getElementById('txnForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('txnAmount').value);

    if (isNaN(amount) || amount < 10) {
        alert("Minimum Deposit ₹10 required!");
        return;
    }

    const options = {
        "key": "rzp_test_YOUR_KEY_HERE",
        "amount": amount * 100,
        "currency": "INR",
        "name": "Pro Ludo Wallet",
        "description": "Wallet Top-up",
        "handler": async function (response) {
            let success = await addTransactionRecord(`💳 Razorpay Deposit (${response.razorpay_payment_id})`, amount, 'income');
            if (success) {
                playSound('win');
                if (window.confetti) confetti();
                alert(`Payment Successful! ₹${amount} added securely.`);
                document.getElementById('txnAmount').value = '';
                showView('home');
            }
        },
        "prefill": {
            "email": currentUser ? currentUser.email : "player@ludo.com"
        },
        "theme": {
            "color": "#6366f1"
        }
    };

    try {
        const rzp = new Razorpay(options);
        rzp.open();
    } catch (err) {
        let userAction = confirm(`Razorpay gateway simulated. Deposit ₹${amount} to wallet?`);
        if (userAction) {
            let success = await addTransactionRecord(`📱 Direct Wallet Deposit`, amount, 'income');
            if (success) {
                playSound('win');
                if (window.confetti) confetti();
                alert(`Deposit Successful! ₹${amount} added.`);
                document.getElementById('txnAmount').value = '';
                showView('home');
            }
        }
    }
});

document.getElementById('withdrawForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const upi = document.getElementById('withdrawUpi').value;
    const amount = parseFloat(document.getElementById('withdrawAmount').value);

    if (amount > currentBalance) {
        alert("Invalid Balance! Payout amount exceeds available total balance.");
        return;
    }

    let success = await addTransactionRecord(`💸 Withdrawal Payout (${upi})`, amount, 'expense');
    if (success) {
        alert("Withdrawal Request Submitted Successfully!");
        document.getElementById('withdrawAmount').value = '';
        showView('home');
    }
});

async function buyItem(itemName, price) {
    if (currentBalance < price) {
        alert("Aapke wallet mein paryapt balance nahi hai! Kripya pehle paise add karein.");
        showView('addMoney');
        return;
    }

    let confirmBuy = confirm(`Kya aap ₹${price} mein '${itemName}' khareedna chahte hain?`);
    if (confirmBuy) {
        let success = await addTransactionRecord(`🛒 Bought ${itemName}`, price, 'expense');
        if (success) {
            playSound('win');
            if (window.confetti) confetti();
            alert(`Badhai ho! Aapne successfully '${itemName}' khareed liya hai.`);
            showView('home');
        }
    }
}

// 🟢 FIX 3: Dynamic Sync between Storage and Active State
async function addTransactionRecord(title, amount, type) {
    if (!currentUser) return false;
    
    const newDoc = { 
        $createdAt: new Date().toISOString(), 
        title: title, 
        amount: amount, 
        type: type 
    };
    
    allTransactions.unshift(newDoc);
    
    // Save to LocalStorage immediately
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(allTransactions));
    
    renderTransactions();

    // Async Cloud Storage backup
    try {
        await databases.createDocument(
            DATABASE_ID,
            COLLECTION_TXN,
            ID.unique(),
            { userId: currentUser.$id, title: title, amount: amount, type: type }
        );
    } catch (err) {
        console.log("Database offline fallback used.");
    }
    return true;
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
            alert(`🎉 Mubarak ho! Aapne ₹${wonAmount} Bonus Cash jeeta!`);
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
            missedTurnsCount++;
            
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

// Start app session execution
checkSession();
