// =================================
//  IMPORTS & FIREBASE CONFIG
// =================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, deleteDoc, updateDoc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const firebaseConfig = { apiKey: "AIzaSyBbxlvJm8gbm7Cv4hdp-UBoKOJfhqYYGW0", authDomain: "trading-journal43.firebaseapp.com", projectId: "trading-journal43", storageBucket: "trading-journal43.appspot.com", messagingSenderId: "920530022010", appId: "1:920530022010:web:28f38a8275c12f6c6795c3", measurementId: "G-8WJHB9L7W6" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// =================================
//  MAIN APP LOGIC
// =================================
document.addEventListener('DOMContentLoaded', () => {

    // ---------------------------------
    //  STATE VARIABLES
    // ---------------------------------
    let trades = [], transactions = [], currentUser = null, tradesUnsubscribe = null, transactionsUnsubscribe = null, settingsUnsubscribe = null, isRegisterMode = false, livePrices = {}, liveDataInterval = null;
    let userSettings = { apiKey: '', broker: 'none' };
    let chartMode = 'realized';
    let cameFromSummary = false;
    const liveDataIntervalTime = 60000;
    let currentFilters = { status: 'all', ticker: '', startDate: '', endDate: '', sort: 'date-desc', plStatus: 'all' };
    let doughnutChart, lineChart;

    // ---------------------------------
    //  DOM ELEMENTS
    // ---------------------------------
    const $ = id => document.getElementById(id);
    const authOverlay = $('auth-overlay'), appContainer = $('app-container'), authForm = $('auth-form'), emailInput = $('email-input'), passwordInput = $('password-input'), authBtn = $('auth-btn'), authLoader = $('auth-loader'), authError = $('auth-error'), authControls = $('auth-controls'), userGreeting = $('user-greeting'), authTitle = $('auth-title'), authSwitchText = $('auth-switch-text'), forgotPasswordLink = $('forgot-password'), portfolioValueEl = $('portfolio-value'), cashAvailableEl = $('cash-available'), stocksValueEl = $('stocks-value'), yearlyTaxEstimateEl = $('yearly-tax-estimate'), taxInfoBtn = $('tax-info-btn'), depositBtn = $('deposit-btn'), withdrawBtn = $('withdraw-btn'), transactionDateInput = $('transaction-date'), transactionAmountInput = $('transaction-amount'), transactionsHistoryList = $('transactions-history-list'), noTransactionsMessage = $('no-transactions-message'), tradeForm = $('trade-form'), tradesList = $('trades-list'), noTradesMessage = $('no-trades-message'), exportTradesBtn = $('export-trades-btn'), exportTransactionsBtn = $('export-transactions-btn'), messageModal = $('message-modal'), editTradeModal = $('edit-trade-modal'), confirmModal = $('confirm-modal'), resetPasswordModal = $('reset-password-modal'), settingsModal = $('settings-modal'), taxInfoModal = $('tax-info-modal'), filterTradesModal = $('filter-trades-modal'), filterTradesBtn = $('filter-trades-btn'), tradesListModal = $('trades-list-modal'), summaryModal = $('summary-modal'), openTradesModalBtn = $('open-trades-modal-btn'), openSummaryModalBtn = $('open-summary-modal-btn'), closeTradesModalBtn = $('close-trades-modal-btn'), closeSummaryModalBtn = $('close-summary-modal-btn');
    const loadingGreeting = $('loading-greeting'), lastLoginText = $('last-login-text'), totalDepositsEl = $('total-deposits');
    const commissionInputContainer = $('commission-input-container');
    const tradeDetailsModal = $('trade-details-modal');
    const clickableOpenTrades = $('clickable-open-trades');
    const clickableClosedTrades = $('clickable-closed-trades');

    // ---------------------------------
    //  UTILITY FUNCTIONS
    // ---------------------------------
    const getTodaysDate = () => new Date().toISOString().split('T')[0];
    const formatCurrency = (num) => { if (num === null || typeof num === 'undefined' || isNaN(num)) return 'N/A'; const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 }; const formattedNum = Math.abs(num).toLocaleString('en-US', options); return num < 0 ? `\u200e-${formattedNum}$` : `\u200e${formattedNum}$`; };
    
    // ---------------------------------
    //  MODAL & UI FUNCTIONS
    // ---------------------------------
    const showMessage = (title, text, duration = 4000) => { 
        messageModal.innerHTML = `<div class="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg text-center">
            <h3 class="text-xl font-bold text-orange-400 mb-4">${title}</h3>
            <p class="text-gray-300 whitespace-pre-wrap">${text}</p>
            <button id="close-modal-btn" class="mt-6 btn-primary px-4 py-2 rounded-lg">סגור</button>
        </div>`; 
        messageModal.classList.remove('hidden'); 
        const closeModal = () => messageModal.classList.add('hidden'); 
        $('close-modal-btn').addEventListener('click', closeModal); 
        if (duration > 0) {
            setTimeout(closeModal, duration); 
        }
    };
    const showConfirmation = (message, onConfirm) => { confirmModal.innerHTML = `<div class="card text-center p-8 w-full max-w-sm"><p class="text-lg font-semibold mb-6 text-white">${message}</p><div class="flex justify-center gap-4"><button id="confirm-cancel-btn" class="btn-secondary px-6 py-2">ביטול</button><button id="confirm-ok-btn" class="btn-primary bg-red-600 hover:bg-red-700 text-white px-6 py-2">אישור</button></div></div>`; confirmModal.classList.remove('hidden'); $('confirm-ok-btn').onclick = () => { onConfirm(); confirmModal.classList.add('hidden'); }; $('confirm-cancel-btn').onclick = () => confirmModal.classList.add('hidden'); };
    
    const showTradeDetailsModal = (trade) => { 
        const pl = calculateTotalPL(trade); 
        const plDisplay = pl !== null ? formatCurrency(pl) : 'פתוחה'; 
        const plClass = pl !== null ? (pl >= 0 ? 'pl-positive' : 'pl-negative') : 'pl-open'; 
        const tradeType = trade.type || 'long'; 
        const modalContent = `<div class="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg text-white"><h3 class="text-xl font-bold mb-4 text-center text-orange-400">פרטי עסקה: ${trade.ticker}</h3><div class="space-y-2 text-right"><p><strong>סוג:</strong> <span class="${tradeType === 'long' ? 'text-green-400' : 'text-red-400'}">${tradeType === 'long' ? 'לונג' : 'שורט'}</span></p><p><strong>תאריך:</strong> ${new Date(trade.date).toLocaleDateString('he-IL')}</p><p><strong>כמות:</strong> ${trade.quantity}</p><p><strong>מחיר כניסה:</strong> ${formatCurrency(trade.entry)}</p><p><strong>מחיר יציאה:</strong> ${trade.exit ? formatCurrency(trade.exit) : '—'}</p><p><strong>עמלה:</strong> ${trade.commission ? formatCurrency(trade.commission) : '—'}</p><p><strong>רווח/הפסד:</strong> <span class="${plClass} font-bold">${plDisplay}</span></p></div><button id="close-trade-details-btn" class="mt-6 w-full btn-primary px-4 py-2 rounded-lg">סגור</button></div>`; 
        tradeDetailsModal.innerHTML = modalContent;
        tradeDetailsModal.classList.remove('hidden'); 
        $('close-trade-details-btn').addEventListener('click', () => tradeDetailsModal.classList.add('hidden')); 
    };

    const closeAllSubMenus = (container) => {
        const subContents = container.querySelectorAll('.collapsible-content');
        const subArrows = container.querySelectorAll('.fa-chevron-down');
        subContents.forEach(content => {
            content.style.maxHeight = '0px';
            content.classList.remove('is-scrollable');
        });
        subArrows.forEach(arrow => arrow.classList.remove('rotate-180'));
    };
    
    const setupCollapsible = (btnId, contentId, arrowId) => { 
        const btn = $(btnId); 
        if (!btn) return; 
        const content = $(contentId); 
        const arrow = $(arrowId); 
        btn.addEventListener('click', () => { 
            const isCollapsed = !content.style.maxHeight || content.style.maxHeight === '0px'; 
            
            if (isCollapsed) { 
                content.style.maxHeight = `${content.scrollHeight}px`;
                if (content.id === 'main-menu-card-content' && content.scrollHeight > content.clientHeight) {
                    setTimeout(() => content.classList.add('is-scrollable'), 300);
                }
                if (btnId !== 'toggle-main-menu-card-btn' && btn.closest('#main-menu-card-content')) {
                    setTimeout(() => {
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }
            } else { 
                content.style.maxHeight = '0px';
                content.classList.remove('is-scrollable');
                if (content.id === 'main-menu-card-content') {
                    closeAllSubMenus(content);
                }
            } 
            if (arrow) arrow.classList.toggle('rotate-180', isCollapsed); 
        }); 
    };

    const closeFullscreenModal = (modal) => { modal.classList.remove('open'); appContainer.classList.remove('blurred'); authOverlay.classList.remove('blurred'); };
    
    const showSettingsModal = () => {
        const statusHtml = userSettings.apiKey ? `<div class="flex items-center text-green-400 text-xs mt-2"><i class="fas fa-check-circle ml-2"></i>מפתח API שמור בחשבונך.</div>` : `<div class="flex items-center text-yellow-400 text-xs mt-2"><i class="fas fa-exclamation-triangle ml-2"></i>לא הוגדר מפתח API. נתוני אמת מושבתים.</div>`;
        settingsModal.innerHTML = `<div class="card p-8 w-full max-w-md"><h3 class="text-xl font-semibold mb-6 text-white">הגדרות</h3><form id="settings-form" class="space-y-6">
            <div>
                <label for="api-key-input" class="block text-sm font-medium">Finnhub API Key</label>
                <input type="text" id="api-key-input" placeholder="הדבק כאן את המפתח שלך" class="input-field w-full" value="${userSettings.apiKey}">
                <p class="text-xs text-gray-400 mt-2">הירשם בחינם באתר <a href="https://finnhub.io" target="_blank" class="text-orange-400 underline">Finnhub.io</a> כדי לקבל מפתח API.</p>${statusHtml}
            </div>
            <div class="border-t border-gray-700 pt-6">
                 <h4 class="text-lg font-semibold text-gray-200 mb-3">ניהול עמלות</h4>
                 <label for="broker-select" class="block text-sm font-medium">הברוקר שלך</label>
                 <div class="flex items-center gap-3">
                     <select id="broker-select" class="select-field w-full">
                        <option value="none">ללא (הזנה ידנית)</option>
                        <option value="blink">Blink</option>
                     </select>
                     <button type="button" id="broker-info-btn" class="btn-icon flex-shrink-0"><i class="fas fa-info-circle text-lg"></i></button>
                 </div>
                 <p class="text-xs text-gray-400 mt-2">בחירת ברוקר תפעיל חישוב עמלות אוטומטי בהתאם לתנאים שלו.</p>
            </div>
            <div class="flex justify-end gap-4 mt-6"><button type="button" id="cancel-settings" class="btn-secondary px-6 py-2">ביטול</button><button type="submit" class="btn-primary px-6 py-2">שמור</button></div>
        </form></div>`;
        
        $('broker-select').value = userSettings.broker;
        
        settingsModal.classList.remove('hidden');
        $('cancel-settings').onclick = () => settingsModal.classList.add('hidden');

        $('broker-info-btn').onclick = () => {
            const selectedBroker = $('broker-select').value;
            let title = "מידע על עמלות";
            let infoText = "בחר ברוקר כדי לראות את תוכנית העמלות שלו.";

            if (selectedBroker === 'blink') {
                title = "תוכנית העמלות של Blink";
                infoText = "• 10 הפעולות הראשונות בכל חודש הן בחינם (0$ עמלה).\n• החל מהפעולה ה-11 (או לאחר מסחר ב-1000 מניות), העמלה היא 1 סנט למניה, עם מינימום של 1.5$ לפעולה.";
            } else if (selectedBroker === 'none') {
                title = "הזנה ידנית";
                infoText = "במצב זה, עליך להזין את סך העמלות עבור כל עסקה באופן ידני בשדה 'עמלה'.";
            }
            showMessage(title, infoText, 0);
        };

        $('settings-form').onsubmit = (e) => {
            e.preventDefault();
            const newSettings = { apiKey: $('api-key-input').value, broker: $('broker-select').value };
            performDbAction(async () => {
                await setDoc(doc(db, "users", currentUser.uid, "settings", "appSettings"), newSettings, { merge: true });
                settingsModal.classList.add('hidden');
                showMessage("שמירת הגדרות", "ההגדרות נשמרו בהצלחה!");
            });
        };
    };

    // ---------------------------------
    //  COMMISSION CALCULATION LOGIC
    // ---------------------------------
    const getMonthlyTradeStats = (tradeDate) => {
        const date = new Date(tradeDate);
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        const tradesThisMonth = trades.filter(t => {
            const d = new Date(t.date);
            return d >= startOfMonth && d <= endOfMonth;
        });

        return {
            tradeCount: tradesThisMonth.length,
            shareVolume: tradesThisMonth.reduce((sum, t) => sum + (t.quantity || 0), 0)
        };
    };
    
    const calculateBlinkCommission = (quantity, monthlyStats) => {
        if (monthlyStats.tradeCount < 10 && monthlyStats.shareVolume < 1000) {
            return 0;
        }
        const commission = quantity * 0.01;
        return Math.max(commission, 1.50);
    };

    const calculateCommission = (tradeDetails) => {
        const { quantity, date, manualCommission } = tradeDetails;
        if (userSettings.broker === 'blink') {
            const monthlyStats = getMonthlyTradeStats(date);
            return calculateBlinkCommission(quantity, monthlyStats);
        }
        return manualCommission || 0;
    };
    
    const updateCommissionInputVisibility = () => {
        if (!commissionInputContainer) return;
        const editCommissionContainer = document.getElementById('edit-commission-input-container');
        
        const shouldShow = userSettings.broker === 'none';
        commissionInputContainer.style.display = shouldShow ? 'block' : 'none';
        if (editCommissionContainer) {
            editCommissionContainer.style.display = shouldShow ? 'block' : 'none';
        }
    };


    // ---------------------------------
    //  CORE LOGIC & CALCULATIONS
    // ---------------------------------
    const calculateTotalPL = (trade) => { 
        if (trade.exit === null || trade.exit === undefined || trade.exit === '') return null; 
        const entry = parseFloat(trade.entry), exit = parseFloat(trade.exit), quantity = parseFloat(trade.quantity), commission = parseFloat(trade.commission) || 0; 
        if(isNaN(entry) || isNaN(exit) || isNaN(quantity)) return null; 
        const grossPL = (trade.type || 'long') === 'long' ? (exit - entry) * quantity : (entry - exit) * quantity; 
        const netPL = grossPL - commission;
        return parseFloat(netPL.toFixed(2));
    };
    const calculatePortfolioValue = () => { const initialCapital = transactions.reduce((acc, t) => t.type === 'deposit' ? acc + t.amount : acc - t.amount, 0); const realizedPL = trades.filter(t => t.exit).reduce((sum, t) => sum + calculateTotalPL(t), 0); const unrealizedPL = trades.filter(t => !t.exit).reduce((sum, t) => { const tempClosedTrade = { ...t, exit: livePrices[t.ticker] || t.entry }; return sum + calculateTotalPL(tempClosedTrade); }, 0); return initialCapital + realizedPL + unrealizedPL; };
    const calculateCashAvailable = () => { const initialCapital = transactions.reduce((acc, t) => t.type === 'deposit' ? acc + t.amount : acc - t.amount, 0); const realizedPL = trades.filter(t => t.exit).reduce((sum, t) => sum + calculateTotalPL(t), 0); const investedInOpenTrades = trades.filter(t => !t.exit).reduce((sum, t) => sum + (t.entry * t.quantity), 0); const { taxEstimate } = calculateYearlyTax(); return initialCapital + realizedPL - investedInOpenTrades - taxEstimate; };
    const calculateStocksValue = () => trades.filter(t => !t.exit).reduce((sum, t) => sum + ((livePrices[t.ticker] || t.entry) * t.quantity), 0);
    const calculateTotalDeposits = () => { return transactions.filter(t => t.type === 'deposit').reduce((sum, t) => sum + t.amount, 0); };
    const calculateYearlyTax = () => { const currentYear = new Date().getFullYear(); const closedTradesThisYear = trades.filter(t => { if (!t.exit) return false; const exitDate = new Date(t.exitDate || t.date); return exitDate.getFullYear() === currentYear; }); let totalGains = 0; let totalLosses = 0; closedTradesThisYear.forEach(t => { const pl = calculateTotalPL(t); if (pl > 0) { totalGains += pl; } else { totalLosses += Math.abs(pl); } }); const netPL = totalGains - totalLosses; const taxEstimate = netPL > 0 ? netPL * 0.25 : 0; return { totalGains, totalLosses, netPL, taxEstimate }; };
    
    // ---------------------------------
    //  LIVE DATA & API
    // ---------------------------------
    const checkAndCloseStoppedTrades = (ticker, livePrice) => { if (!currentUser) return; trades.filter(t => t.ticker === ticker && !t.exit && t.stopLoss).forEach(trade => { const sl = parseFloat(trade.stopLoss); let triggered = (trade.type || 'long') === 'long' ? livePrice <= sl : livePrice >= sl; if (triggered) { console.log(`Stop loss triggered for ${trade.ticker} at ${sl}`); updateDoc(doc(db, "users", currentUser.uid, "trades", trade.id), { exit: sl, exitDate: getTodaysDate(), notes: (trade.notes || '') + `\n(נסגרה אוטומטית ע"י סטופ לוס ב-${new Date().toLocaleString('he-IL')})` }).catch(e => console.error("Error closing trade by SL:", e)); } }); };
    const fetchLivePrices = async () => { if (!userSettings.apiKey) return; const tickersToFetch = [...new Set(trades.filter(t => !t.exit).map(t => t.ticker))]; if (tickersToFetch.length === 0) return; let pricesUpdated = false; for (const t of tickersToFetch) { try { const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${t}&token=${userSettings.apiKey}`); if (!res.ok) { console.warn(`Finnhub API request failed for ${t} with status: ${res.status}`); continue; } const data = await res.json(); if (data.c !== null && data.c !== undefined) { livePrices[t] = data.c; pricesUpdated = true; checkAndCloseStoppedTrades(t, data.c); } else { console.log(`No valid price data received for ticker: ${t}`); } } catch (error) { console.error(`Error fetching price for ${t}:`, error); } } if (pricesUpdated) { renderPortfolioValue(); renderTrades(); } };
    const startLiveData = () => { if (liveDataInterval) clearInterval(liveDataInterval); if (userSettings.apiKey) { fetchLivePrices(); liveDataInterval = setInterval(fetchLivePrices, liveDataIntervalTime); } };
    const stopLiveData = () => { if (liveDataInterval) { clearInterval(liveDataInterval); liveDataInterval = null; } };

    // ---------------------------------
    //  RENDERING FUNCTIONS
    // ---------------------------------
    const getFilteredTrades = () => { 
        let filtered = [...trades]; 
        if (currentFilters.status === 'open') {
            filtered = trades.filter(t => t.exit === null || t.exit === '');
        } else if (currentFilters.status === 'closed') {
            filtered = trades.filter(t => t.exit !== null && t.exit !== '');
        }
        if (currentFilters.ticker) filtered = filtered.filter(t => t.ticker.toUpperCase().includes(currentFilters.ticker.toUpperCase())); 
        if (currentFilters.startDate) filtered = filtered.filter(t => t.date >= currentFilters.startDate); 
        if (currentFilters.endDate) filtered = filtered.filter(t => t.date <= currentFilters.endDate); 
        if (currentFilters.plStatus === 'profitable') { filtered = filtered.filter(t => calculateTotalPL(t) !== null && calculateTotalPL(t) > 0); } 
        else if (currentFilters.plStatus === 'losing') { filtered = filtered.filter(t => calculateTotalPL(t) !== null && calculateTotalPL(t) < 0); } 
        filtered.sort((a, b) => { if ($('show-open-trades-toggle').checked) { const aIsOpen = !a.exit, bIsOpen = !b.exit; if (aIsOpen && !bIsOpen) return -1; if (!aIsOpen && bIsOpen) return 1; } return currentFilters.sort === 'date-asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date); }); 
        return filtered;
    };
    const renderPortfolioValue = () => { const value = calculatePortfolioValue(); portfolioValueEl.textContent = formatCurrency(value); const portfolioReturnEl = $('portfolio-return'); const totalDepositsVal = calculateTotalDeposits(); if (totalDepositsVal > 0) { const returnPercentage = ((value - totalDepositsVal) / totalDepositsVal) * 100; portfolioReturnEl.textContent = `תשואה כוללת: \u200e${returnPercentage.toFixed(2)}%`; portfolioReturnEl.className = `text-lg mt-1 ${returnPercentage >= 0 ? 'pl-positive' : 'pl-negative'}`; } else { portfolioReturnEl.textContent = 'בצע הפקדה כדי לחשב תשואה'; portfolioReturnEl.className = 'text-sm text-gray-400 mt-1'; } cashAvailableEl.textContent = formatCurrency(calculateCashAvailable()); stocksValueEl.textContent = formatCurrency(calculateStocksValue()); totalDepositsEl.textContent = formatCurrency(totalDepositsVal); const taxData = calculateYearlyTax(); yearlyTaxEstimateEl.textContent = formatCurrency(taxData.taxEstimate); };
    const renderTransactions = () => { const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)); transactionsHistoryList.innerHTML = ''; noTransactionsMessage.classList.toggle('hidden', sorted.length > 0); sorted.forEach(t => { const isDeposit = t.type === 'deposit'; const el = document.createElement('div'); el.className = `flex justify-between items-center p-2 rounded-lg ${isDeposit ? 'bg-green-900/50' : 'bg-red-900/50'}`; el.innerHTML = `<div><p class="font-bold ${isDeposit ? 'text-green-400' : 'text-red-400'}">${isDeposit ? 'הפקדה' : 'משיכה'}: ${formatCurrency(t.amount)}</p><p class="text-xs text-gray-400">${new Date(t.date).toLocaleDateString('he-IL')}</p></div><div class="flex space-x-2"><button data-id="${t.id}" class="delete-transaction-btn btn-icon w-8 h-8"><i class="fas fa-trash-alt btn-delete-icon"></i></button></div>`; transactionsHistoryList.appendChild(el); }); };
    const renderYearlyTaxSummary = () => { const taxData = calculateYearlyTax(); $('tax-summary-year').textContent = `סיכום מס לשנת ${new Date().getFullYear()}`; $('yearly-tax-gains').textContent = formatCurrency(taxData.totalGains); $('yearly-tax-losses').textContent = formatCurrency(taxData.totalLosses * -1); const netPlEl = $('yearly-tax-net-pl'); netPlEl.textContent = formatCurrency(taxData.netPL); netPlEl.className = `text-xl font-bold ${taxData.netPL >= 0 ? 'pl-positive' : 'pl-negative'}`; $('yearly-tax-due').textContent = formatCurrency(taxData.taxEstimate); };
    const renderTrades = () => { const filtered = getFilteredTrades(); tradesList.innerHTML = ''; noTradesMessage.classList.toggle('hidden', filtered.length > 0); filtered.forEach(t => { const pl = calculateTotalPL(t); let livePLContent = ''; let percentDisplay = ''; if (pl !== null && t.entry > 0) { const grossInvestment = t.entry * t.quantity; const percent = (pl / grossInvestment) * 100; const percentClass = percent >= 0 ? 'pl-positive' : 'pl-negative'; percentDisplay = ` (<span class="${percentClass} font-normal">${percent.toFixed(2)}%</span>)`; } if (pl === null && userSettings.apiKey && livePrices[t.ticker]) { const livePrice = livePrices[t.ticker]; const livePL = calculateTotalPL({ ...t, exit: livePrice }); let livePercent = 0; if (t.entry > 0) { const grossInvestment = t.entry * t.quantity; livePercent = (livePL / grossInvestment) * 100; } const livePercentClass = livePercent >= 0 ? 'pl-positive' : 'pl-negative'; livePLContent = `<div class="col-span-2 grid grid-cols-2"><div><span class="font-semibold">מחיר נוכחי: </span><span class="text-gray-300 font-bold">${formatCurrency(livePrice)}</span></div><div><span class="font-semibold">רווח/הפסד נוכחי: </span><span class="${livePL >= 0 ? 'pl-positive' : 'pl-negative'} font-bold">${formatCurrency(livePL)}</span><span class="${livePercentClass} font-normal"> (${livePercent.toFixed(2)}%)</span></div></div>`; } const plDisplay = pl !== null ? formatCurrency(pl) : 'פתוחה'; const plClass = pl !== null ? (pl >= 0 ? 'pl-positive' : 'pl-negative') : 'pl-open'; const type = t.type || 'long', typeClass = type === 'long' ? 'text-green-400' : 'text-red-400', typeIcon = type === 'long' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'; const el = document.createElement('div'); el.className = 'card p-4'; el.innerHTML = `<div class="flex justify-between items-start mb-2"><div><span class="text-xl font-bold">${t.ticker}</span><span class="text-sm text-gray-400 block">${new Date(t.date).toLocaleDateString('he-IL')}</span></div><div class="flex items-center space-x-2"><span class="flex items-center gap-2 text-sm font-bold ${typeClass}"><i class="fas ${typeIcon}"></i> ${type === 'long' ? 'לונג' : 'שורט'}</span><button data-id="${t.id}" class="edit-trade-btn btn-icon"><i class="fas fa-edit btn-edit-icon"></i></button><button data-id="${t.id}" class="delete-trade-btn btn-icon"><i class="fas fa-trash-alt btn-delete-icon"></i></button></div></div><div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-300"><div><span class="font-semibold">כניסה:</span> ${formatCurrency(t.entry)}</div><div><span class="font-semibold">יציאה:</span> ${t.exit ? formatCurrency(t.exit) : '—'}</div><div><span class="font-semibold">כמות:</span> ${t.quantity}</div>${t.stopLoss ? `<div><span class="font-semibold">סטופ לוס:</span> ${formatCurrency(t.stopLoss)}</div>` : ''}<div class="col-span-2"><span class="font-semibold">רווח/הפסד נטו: </span><span class="${plClass} font-bold">${plDisplay}</span>${percentDisplay}</div>${livePLContent}${t.commission > 0 ? `<div class="col-span-2"><span class="font-semibold">עמלה:</span> ${formatCurrency(t.commission)}</div>` : ''}${t.reason ? `<div class="col-span-2"><span class="font-semibold">סיבה:</span> ${t.reason}</div>` : ''}${t.notes ? `<div class="col-span-2 whitespace-pre-wrap"><span class="font-semibold">הערות:</span> ${t.notes}</div>` : ''}</div>`; tradesList.appendChild(el); }); };
    const renderSummary = () => { const closed = trades.filter(t => t.exit); const openCount = trades.filter(t => !t.exit).length; $('open-trades-summary').textContent = openCount; if (closed.length === 0 && openCount === 0) { [$('total-pl'), $('total-trades'), $('win-rate'), $('avg-pl'), $('open-trades-summary')].forEach(el => { if(el) el.textContent = 'N/A'; }); updateDoughnutChart(0,0); updateLineChart(); return; } const totalPL = closed.reduce((sum, t) => sum + calculateTotalPL(t), 0); const wins = closed.filter(t => calculateTotalPL(t) > 0).length; $('total-pl').textContent = formatCurrency(totalPL); $('total-pl').className = `font-bold ${totalPL >= 0 ? 'pl-positive' : 'pl-negative'}`; $('total-trades').textContent = closed.length; $('win-rate').textContent = closed.length > 0 ? `\u200e${((wins / closed.length) * 100).toFixed(1)}%` : 'N/A'; $('avg-pl').textContent = closed.length > 0 ? formatCurrency(totalPL / closed.length) : 'N/A'; $('avg-pl').className = `font-bold ${(totalPL / closed.length) >= 0 ? 'pl-positive' : 'pl-negative'}`; updateDoughnutChart(wins, closed.length - wins); updateLineChart(); };
    
const updateDoughnutChart = (wins, losses) => {
        const ctx = $('trades-chart').getContext('2d');
        if (doughnutChart) doughnutChart.destroy();
        doughnutChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['מנצחות', 'מפסידות'],
                datasets: [{ data: [wins, losses], backgroundColor: ['#16a34a', '#dc2626'], hoverOffset: 4 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const segmentIndex = elements[0].index;
                        currentFilters.plStatus = (segmentIndex === 0) ? 'profitable' : 'losing';
                        cameFromSummary = true;
                        summaryModal.classList.remove('open');
                        tradesListModal.classList.add('open');
                        renderTrades();
                        updateClearFilterButtonVisibility();
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#e2e8f0' },
                        onClick: (e, legendItem, legend) => {
                            const chart = legend.chart;
                            const index = legendItem.index;
                            const meta = chart.getDatasetMeta(0);

                            // בודק אם הפריט שנלחץ הוא היחיד שגלוי
                            const isOnlyOneVisible = meta.data.filter(d => !d.hidden).length === 1 && !meta.data[index].hidden;

                            if (isOnlyOneVisible) {
                                // אם הוא היחיד, הופך את כולם לגלויים
                                meta.data.forEach(segment => segment.hidden = false);
                            } else {
                                // אחרת, הופך רק את הפריט שנלחץ לגלוי
                                meta.data.forEach((segment, i) => {
                                    segment.hidden = i !== index;
                                });
                            }
                            chart.update();
                        }
                    }
                }
            }
        });
    };    
    const updateLineChart = () => {
        const ctx = $('cumulative-pl-chart').getContext('2d');
        if (lineChart) lineChart.destroy();

        let chartData, yAxisLabel;

        if (chartMode === 'equity') {
            yAxisLabel = "שווי התיק ($)";
            const closedTrades = trades.filter(t => t.exit);
            const events = [
                ...transactions.map(t => ({ ...t, eventType: 'transaction', sortDate: t.date })),
                ...closedTrades.map(t => ({ ...t, eventType: 'trade', sortDate: (t.exitDate || t.date) }))
            ].sort((a, b) => new Date(a.sortDate) - new Date(b.sortDate));

            let equity = 0;
            const points = [];
            const labels = [];
            const eventObjects = [];

            events.forEach(event => {
                if (event.eventType === 'transaction') {
                    equity += event.type === 'deposit' ? event.amount : -event.amount;
                } else {
                    equity += calculateTotalPL(event);
                }
                labels.push(new Date(event.sortDate).toLocaleDateString('he-IL'));
                points.push(equity);
                eventObjects.push(event); 
            });
            chartData = { labels, points, eventObjects };
        } else { // 'realized' mode
            yAxisLabel = "רווח/הפסד מצטבר ($)";
            const closedTrades = trades.filter(t => t.exit);
            const sorted = [...closedTrades].sort((a, b) => new Date(a.exitDate || a.date) - new Date(b.exitDate || b.date));
            let sum = 0;
            const points = sorted.map(t => sum += calculateTotalPL(t));
            chartData = {
                labels: sorted.map(t => new Date(t.exitDate || t.date).toLocaleDateString('he-IL')),
                points: points,
                eventObjects: sorted
            };
        }

        lineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{ label: yAxisLabel, data: chartData.points, borderColor: '#fb923c', tension: 0.1 }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                onClick: (e, els) => { 
                    if (els.length > 0) {
                        const event = chartData.eventObjects[els[0].index];
                        if (!event) return;
                        
                        if (event.eventType === undefined || event.eventType === 'trade') {
                            showTradeDetailsModal(event);
                        } else if (event.eventType === 'transaction') {
                            const typeText = event.type === 'deposit' ? 'הפקדה' : 'משיכה';
                            const infoText = `תאריך: ${new Date(event.date).toLocaleDateString('he-IL')}\nסכום: ${formatCurrency(event.amount)}`;
                            showMessage(`פרטי פעולה: ${typeText}`, infoText, 0);
                        }
                    } 
                }, 
                plugins: { 
                    legend: { display: false }, 
                    tooltip: { callbacks: { label: (c) => `${c.dataset.label || ''}: ${formatCurrency(c.parsed.y)}` }}
                }, 
                scales: { 
                    y: { ticks: { color: '#e2e8f0' }, grid: { color: 'rgba(255,255,255,0.1)' }}, 
                    x: { display: false } 
                } 
            }
        });
    };

    const updateUI = () => { renderPortfolioValue(); renderTransactions(); renderYearlyTaxSummary(); renderTrades(); updateCommissionInputVisibility(); };

    // ---------------------------------
    //  AUTHENTICATION & DATA SUBSCRIPTION
    // ---------------------------------
    const handleAuthStateChange = (user) => {
        const loadingOverlay = $('loading-overlay');
        if (!loadingOverlay) { console.error("Loading overlay not found!"); authOverlay.classList.remove('hidden'); return; }

        if (user) {
            currentUser = user;
            loadingOverlay.style.pointerEvents = 'auto'; loadingOverlay.style.opacity = '1';
            authOverlay.classList.add('hidden'); appContainer.classList.add('blurred');
            
            const mainMenuContent = $('main-menu-card-content');
            if (mainMenuContent) {
                mainMenuContent.style.maxHeight = '0px';
                mainMenuContent.classList.remove('is-scrollable');
                const mainMenuArrow = $('main-menu-card-arrow');
                if (mainMenuArrow) mainMenuArrow.classList.remove('rotate-180');
                closeAllSubMenus(mainMenuContent);
            }

            const lastLoginISO = localStorage.getItem(`lastLogin_${user.uid}`);
            loadingGreeting.textContent = `שלום, ${user.email.split('@')[0]}`;
            if (lastLoginISO) {
                const lastLoginDate = new Date(lastLoginISO);
                lastLoginText.textContent = `כניסתך האחרונה: ${lastLoginDate.toLocaleDateString('he-IL')} בשעה ${lastLoginDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
            } else {
                lastLoginText.textContent = "זוהי כניסתך הראשונה. ברוך הבא!";
            }
            localStorage.setItem(`lastLogin_${user.uid}`, new Date().toISOString());

            setTimeout(() => {
                loadingOverlay.style.opacity = '0'; loadingOverlay.style.pointerEvents = 'none';
                appContainer.classList.remove('blurred');
            }, 2500);

            userGreeting.textContent = `שלום, ${user.email.split('@')[0]}`;
            authControls.innerHTML = `<button id="logout-btn" class="btn-secondary px-4 py-2">התנתק</button><button id="settings-btn-header" class="btn-icon text-xl"><i class="fas fa-cog"></i></button>`;
            
            if (tradesUnsubscribe) tradesUnsubscribe(); if (transactionsUnsubscribe) transactionsUnsubscribe(); if (settingsUnsubscribe) settingsUnsubscribe();
            
            settingsUnsubscribe = onSnapshot(doc(db, "users", user.uid, "settings", "appSettings"), d => { 
                if (d.exists() && d.data()) {
                    userSettings.apiKey = d.data().apiKey || '';
                    userSettings.broker = d.data().broker || 'none';
                } else {
                    userSettings = { apiKey: '', broker: 'none' };
                }
                startLiveData(); 
                updateCommissionInputVisibility();
            });
            
            tradesUnsubscribe = onSnapshot(query(collection(db, "users", currentUser.uid, "trades")), s => {
                trades = s.docs.map(d => {
                    const tradeData = d.data();
                    if (tradeData.exit !== null && !tradeData.exitDate) {
                        tradeData.exitDate = tradeData.date;
                    }
                    return { id: d.id, ...tradeData };
                });
                updateUI();
                startLiveData();
            });

            transactionsUnsubscribe = onSnapshot(query(collection(db, "users", currentUser.uid, "transactions")), s => { transactions = s.docs.map(d => ({ id: d.id, ...d.data() })); updateUI(); });
        } else {
            currentUser = null; trades = []; transactions = []; userSettings = { apiKey: '', broker: 'none' };
            if (tradesUnsubscribe) tradesUnsubscribe(); if (transactionsUnsubscribe) transactionsUnsubscribe(); if (settingsUnsubscribe) settingsUnsubscribe();
            stopLiveData();
            setTimeout(() => {
                loadingOverlay.style.opacity = '0'; loadingOverlay.style.pointerEvents = 'none';
                authOverlay.classList.remove('hidden'); appContainer.classList.add('blurred');
            }, 500);
            
            authControls.innerHTML = ''; updateUI();
        }
    };
    const toggleAuthMode = () => { isRegisterMode = !isRegisterMode; authError.textContent = ''; authForm.reset(); if (isRegisterMode) { authTitle.textContent = 'הרשמה'; authBtn.textContent = 'הירשם'; authSwitchText.innerHTML = `כבר יש לך חשבון? <span id="switch-to-login" class="auth-link">התחבר כאן</span>`; $('switch-to-login').onclick = toggleAuthMode; } else { authTitle.textContent = 'התחברות'; authBtn.textContent = 'התחבר'; authSwitchText.innerHTML = `אין לך חשבון? <span id="switch-to-register" class="auth-link">הירשם כאן</span>`; $('switch-to-register').onclick = toggleAuthMode; } };
    
    // ---------------------------------
    //  DATABASE ACTIONS
    // ---------------------------------
    const performDbAction = async (action) => { if (!currentUser) { showMessage("שגיאה", "עליך להיות מחובר."); return; } try { await action(); } catch (e) { console.error("Firestore Error:", e); showMessage("שגיאה", "אירעה שגיאה בבסיס הנתונים."); } };
    
    // ---------------------------------
    //  REPORTS
    // ---------------------------------
    const getReportStyles = () => {
        const stampCSS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');.stamp-wrapper{display:flex;align-items:center;justify-content:flex-start;gap:15px;margin-top:2rem;padding-top:1.5rem;border-top:1px solid #ccc;}.stamp-text{font-size:0.875rem;color:#333;}.stamp-container{position:relative;width:80px;height:80px;}.stamp-circle{position:relative;width:100%;height:100%;border-radius:50%;border:3px solid #000;color:#000;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:5px;box-sizing:border-box;transform:rotate(-10deg);}.stamp-text-line{font-size:0.8rem;font-weight:700;line-height:1;letter-spacing:1px;font-family:'Playfair Display',serif;}.stamp-number-line{font-size:1.2rem;font-weight:700;line-height:1;margin:2px 0;font-family:'Playfair Display',serif;}.stamp-line{width:60%;height:1px;background-color:#000;margin:2px 0;}`;
        return `<style>
            body{font-family:Rubik,sans-serif;background-color:#fff;color:#000;padding:2rem;padding-top: 5rem;}
            table{width:100%;border-collapse:collapse;margin-bottom:2rem}
            th,td{text-align:right;padding:8px;border:1px solid #ccc}
            th{background-color:#f3f4f6}
            td{padding:12px 8px}
            #summary, .report-container div, #controls {background-color:#f3f4f6;border:1px solid #e5e7eb;padding:1.5rem;border-radius:.5rem}
            h1{font-size:2rem;text-align:center;margin-bottom:1rem}
            .pl-positive { color: #16a34a !important; }
            .pl-negative { color: #dc2626 !important; }
            .print-btn-container { position: fixed; top: 1rem; left: 1rem; z-index: 100; }
            .print-btn-container button { padding: .5rem 1rem; background:#f97316; color:#fff; border:none; border-radius:.5rem; cursor:pointer; font-weight:700; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
            input, select {width:100%;background:#fff;border:1px solid #ccc;color:#000;border-radius:.5rem;padding:.5rem}
            label {display:block;font-size:.875rem;margin-bottom:.25rem}
            #controls {margin-bottom:2rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1.5rem;align-items:end}
            #clear-filter-btn {width:100%;padding:.5rem;border-radius:.5rem;background-color:#e5e7eb;color:#000;border:1px solid #ccc;cursor:pointer}
            @media print { 
                body { padding-top: 2rem; }
                .print-btn-container, #controls { display: none !important; } 
                table { font-size: 10pt; }
            }
            ${stampCSS}
        </style>`;
    };
    const getStampHTML = () => `<div class="stamp-wrapper"><p class="stamp-text">מסמך זה הופק על ידי</p><div class="stamp-container"><div class="stamp-circle"><div class="stamp-text-line">trading</div><div class="stamp-text-line">journal</div><div class="stamp-number-line">44</div><div class="stamp-line"></div></div></div></div>`;
    const openReportWindow = (html) => {
        const win = window.open("", "_blank");
        if (!win || win.closed || typeof win.closed == 'undefined') {
            showMessage("שגיאה בפתיחת דוח", "נראה שהדפדפן שלך חסם את פתיחת החלון. \nאנא ודא שחוסם החלונות הקופצים מבוטל עבור אתר זה.", 0);
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
    };

    // ---------------------------------
    //  EVENT LISTENERS & INITIALIZATION
    // ---------------------------------
    document.body.addEventListener('click', e => { 
        if (e.target.closest('#logout-btn')) { signOut(auth); }
        if (e.target.closest('#settings-btn-header')) { showSettingsModal(); }
        if (e.target.closest('.delete-trade-btn')) { const id = e.target.closest('.delete-trade-btn').dataset.id; showConfirmation('האם למחוק את העסקה?', () => performDbAction(() => deleteDoc(doc(db, "users", currentUser.uid, "trades", id)))); } 
        if (e.target.closest('.delete-transaction-btn')) { const id = e.target.closest('.delete-transaction-btn').dataset.id; showConfirmation('האם למחוק את הפעולה?', () => performDbAction(() => deleteDoc(doc(db, "users", currentUser.uid, "transactions", id)))); } 
        if (e.target.closest('#clear-filters-btn-list')) { clearFilters(); } 
        if (e.target.closest('#clickable-open-trades')) {
            cameFromSummary = true;
            clearFilters();
            currentFilters.status = 'open';
            summaryModal.classList.remove('open');
            tradesListModal.classList.add('open');
            renderTrades();
            updateClearFilterButtonVisibility();
        }
        if (e.target.closest('#clickable-closed-trades')) {
            cameFromSummary = true;
            clearFilters();
            currentFilters.status = 'closed';
            summaryModal.classList.remove('open');
            tradesListModal.classList.add('open');
            renderTrades();
            updateClearFilterButtonVisibility();
        }
        if (e.target.closest('.edit-trade-btn')) { 
            const id = e.target.closest('.edit-trade-btn').dataset.id; 
            const trade = trades.find(t => t.id === id); 
            if (!trade) return; 
            const exitDateValue = trade.exitDate || getTodaysDate(); 
            editTradeModal.innerHTML = `<div class="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-lg text-white"><h3 class="text-xl font-semibold mb-6">ערוך / סגור עסקה: ${trade.ticker}</h3><form id="edit-trade-form" class="space-y-4"><div class="flex justify-center gap-4 mb-4 border-b border-gray-700 pb-4"><input type="radio" id="edit-trade-type-long" name="edit-trade-type" value="long" class="trade-type-input"><label for="edit-trade-type-long" class="trade-type-label flex items-center gap-2"><i class="fas fa-arrow-trend-up text-green-400"></i> לונג</label><input type="radio" id="edit-trade-type-short" name="edit-trade-type" value="short" class="trade-type-input"><label for="edit-trade-type-short" class="trade-type-label flex items-center gap-2"><i class="fas fa-arrow-trend-down text-red-400"></i> שורט</label></div><input type="hidden" id="edit-trade-id" value="${trade.id}"><div class="grid grid-cols-2 gap-4"><div><label>תאריך כניסה</label><input type="date" id="edit-trade-date" class="input-field w-full" value="${trade.date}" required></div><div><label>טיקר</label><input type="text" id="edit-trade-ticker" class="input-field w-full" value="${trade.ticker}" required oninput="this.value = this.value.toUpperCase()"></div><div><label>כמות</label><input type="number" step="any" inputmode="decimal" id="edit-trade-quantity" class="input-field w-full" value="${trade.quantity}" required></div><div><label>מחיר כניסה</label><input type="number" inputmode="decimal" step="0.01" id="edit-trade-entry" class="input-field w-full" value="${trade.entry}" required></div><div><label>מחיר יציאה</label><input type="number" inputmode="decimal" step="0.01" id="edit-trade-exit" class="input-field w-full" placeholder="השאר ריק לעסקה פתוחה" value="${trade.exit || ''}"></div><div><label>תאריך יציאה</label><input type="date" id="edit-trade-exit-date" class="input-field w-full" value="${exitDateValue}"></div><div class="col-span-2"><label>סטופ לוס</label><input type="number" inputmode="decimal" step="0.01" id="edit-trade-stop-loss" class="input-field w-full" value="${trade.stopLoss || ''}"></div><div id="edit-commission-input-container" class="col-span-2"><label>עמלה ($)</label><input type="number" inputmode="decimal" step="0.01" id="edit-trade-commission" class="input-field w-full" value="${trade.commission || ''}"></div></div><div class="mt-4"><label>הערות</label><textarea id="edit-trade-notes" class="input-field w-full" rows="2">${trade.notes || ''}</textarea></div><div class="flex justify-end space-x-2 mt-6"><button type="button" id="cancel-edit-trade-btn" class="btn-secondary px-4 py-2 rounded-lg">ביטול</button><button type="submit" class="btn-primary px-4 py-2 rounded-lg">שמור שינויים</button></div></form></div>`; 
            updateCommissionInputVisibility();
            editTradeModal.classList.remove('hidden'); 
            const tradeType = trade.type || 'long'; 
            if (tradeType === 'short') { $('edit-trade-type-short').checked = true; } else { $('edit-trade-type-long').checked = true; } 
            $('cancel-edit-trade-btn').onclick = () => editTradeModal.classList.add('hidden'); 
            $('edit-trade-form').onsubmit = (ev) => { 
                ev.preventDefault(); 
                const exitPrice = $('edit-trade-exit').value ? parseFloat($('edit-trade-exit').value) : null; 
                const exitDate = exitPrice !== null ? $('edit-trade-exit-date').value : null; 
                const manualCommission = $('edit-trade-commission').value ? parseFloat($('edit-trade-commission').value) : 0;
                const tradeDetails = { quantity: parseFloat($('edit-trade-quantity').value), date: $('edit-trade-date').value, manualCommission: manualCommission };
                const finalCommission = calculateCommission(tradeDetails);
                const updated = { type: document.querySelector('input[name="edit-trade-type"]:checked').value, date: tradeDetails.date, ticker: $('edit-trade-ticker').value.toUpperCase(), quantity: tradeDetails.quantity, entry: parseFloat($('edit-trade-entry').value), stopLoss: $('edit-trade-stop-loss').value ? parseFloat($('edit-trade-stop-loss').value) : null, exit: exitPrice, exitDate: exitDate, notes: $('edit-trade-notes').value, commission: finalCommission }; 
                performDbAction(async () => { await updateDoc(doc(db, "users", currentUser.uid, "trades", trade.id), updated); editTradeModal.classList.add('hidden'); showMessage("עדכון עסקה", 'העסקה עודכנה בהצלחה'); }); 
            }; 
        }
        if(e.target.closest('.chart-toggle-btn')) {
            const btn = e.target.closest('.chart-toggle-btn');
            chartMode = btn.id === 'chart-mode-equity' ? 'equity' : 'realized';
            document.querySelectorAll('.chart-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateLineChart();
        }
    });

    $('switch-to-register').addEventListener('click', toggleAuthMode);
    authForm.addEventListener('submit', async (e) => { e.preventDefault(); authError.textContent = ''; const email = emailInput.value, password = passwordInput.value; authBtn.classList.add('hidden'); authLoader.classList.remove('hidden'); try { if (isRegisterMode) await createUserWithEmailAndPassword(auth, email, password); else await signInWithEmailAndPassword(auth, email, password); } catch (error) { authError.textContent = { 'auth/email-already-in-use': 'כתובת אימייל זו כבר בשימוש.', 'auth/invalid-email': 'כתובת אימייל לא חוקית.', 'auth/weak-password': 'סיסמה חלשה מדי (נדרשים לפחות 6 תווים).', 'auth/wrong-password': 'אימייל או סיסמה שגויים.', 'auth/user-not-found': 'אימייל או סיסמה שגויים.', 'invalid-credential': 'אימייל או סיסמה שגויים.' }[error.code] || 'אירעה שגיאה. נסה שוב.'; } finally { authBtn.classList.remove('hidden'); authLoader.classList.add('hidden'); } });
    forgotPasswordLink.addEventListener('click', () => { resetPasswordModal.innerHTML = `<div class="card p-8 w-full max-w-sm"><h3 class="text-xl font-semibold mb-6 text-white">איפוס סיסמה</h3><form id="reset-password-form"><p class="text-sm text-gray-400 mb-4">הזן את כתובת המייל שלך ונשלח לך לינק לאיפוס הסיסמה.</p><input type="email" id="reset-email-input" placeholder="כתובת אימייל" class="input-field w-full text-center mb-4" required><div class="flex justify-center gap-4 mt-6"><button type="button" id="cancel-reset" class="btn-secondary px-6 py-2">ביטול</button><button type="submit" class="btn-primary px-6 py-2">שלח</button></div></form></div>`; resetPasswordModal.classList.remove('hidden'); $('cancel-reset').onclick = () => resetPasswordModal.classList.add('hidden'); $('reset-password-form').onsubmit = async (e) => { e.preventDefault(); try { await sendPasswordResetEmail(auth, $('reset-email-input').value); showMessage("איפוס סיסמה", 'נשלח מייל לאיפוס סיסמה. מומלץ לבדוק גם בתיקיית הספאם.'); } catch (error) { showMessage("שגיאה", 'אירעה שגיאה בשליחת המייל.'); console.error('Password Reset Error:', error); } finally { resetPasswordModal.classList.add('hidden'); } }; });
    depositBtn.addEventListener('click', () => { const amount = parseFloat(transactionAmountInput.value); if (isNaN(amount) || amount <= 0) { showMessage("שגיאה", "אנא הזן סכום חיובי."); return; } performDbAction(async () => { await addDoc(collection(db, "users", currentUser.uid, "transactions"), { type: 'deposit', amount, date: transactionDateInput.value || getTodaysDate() }); transactionAmountInput.value = ''; }); });
    withdrawBtn.addEventListener('click', () => { const amount = parseFloat(transactionAmountInput.value); if (isNaN(amount) || amount <= 0) { showMessage("שגיאה", "אנא הזן סכום חיובי."); return; } performDbAction(async () => { await addDoc(collection(db, "users", currentUser.uid, "transactions"), { type: 'withdraw', amount, date: transactionDateInput.value || getTodaysDate() }); transactionAmountInput.value = ''; }); });
    
    tradeForm.addEventListener('submit', (e) => { 
        e.preventDefault(); 
        const exitPrice = $('trade-exit').value ? parseFloat($('trade-exit').value) : null; 
        const manualCommission = $('trade-commission').value ? parseFloat($('trade-commission').value) : 0;
        const tradeDetails = { quantity: parseFloat($('trade-quantity').value), date: $('trade-date').value, manualCommission: manualCommission };
        
        const finalCommission = calculateCommission(tradeDetails);

        const newTrade = { type: document.querySelector('input[name="trade-type"]:checked').value, date: tradeDetails.date, ticker: $('trade-ticker').value.toUpperCase(), quantity: tradeDetails.quantity, entry: parseFloat($('trade-entry').value), stopLoss: $('trade-stop-loss').value ? parseFloat($('trade-stop-loss').value) : null, exit: exitPrice, exitDate: exitPrice !== null ? getTodaysDate() : null, commission: finalCommission, reason: $('trade-reason').value, notes: $('trade-notes').value }; 
        if (!newTrade.date || !newTrade.ticker || isNaN(newTrade.quantity) || isNaN(newTrade.entry) || newTrade.quantity <= 0) { showMessage("שגיאה", "אנא מלא את כל שדות החובה."); return; } 
        
        performDbAction(async () => { 
            if (userSettings.broker === 'blink') {
                const stats = getMonthlyTradeStats(newTrade.date);
                if (stats.tradeCount === 9) {
                     showMessage("עדכון עמלות", "הגעת לתקרת 10 הפעולות החינמיות לחודש זה.\nהחל מהפעולה הבאה, תחויב בעמלה.", 6000);
                }
            }
            await addDoc(collection(db, "users", currentUser.uid, "trades"), newTrade); 

            tradeForm.reset(); 
            $('trade-date').value = getTodaysDate(); 
        }); 
    });
    
    openTradesModalBtn.onclick = () => { cameFromSummary = false; clearFilters(); tradesListModal.classList.add('open'); };
    openSummaryModalBtn.onclick = () => { renderSummary(); summaryModal.classList.add('open'); };
    closeSummaryModalBtn.onclick = () => { summaryModal.classList.remove('open'); };
    closeTradesModalBtn.onclick = () => {
        tradesListModal.classList.remove('open');
        if (cameFromSummary) {
            summaryModal.classList.add('open');
        }
        clearFilters();
    };
    taxInfoBtn.addEventListener('click', () => { taxInfoModal.innerHTML = `<div class="card p-8 w-full max-w-md"><h3 class="text-xl font-semibold mb-4 text-white">מס שנתי משוערך</h3><p class="text-gray-300">הסכום המוצג הוא הערכה של חבות המס על רווחי הון שמומשו מתחילת השנה הקלנדרית, **לאחר קיזוז הפסדים ועמלות** שמומשו באותה התקופה.</p><ul class="list-disc list-inside text-gray-400 my-4 space-y-2"><li>החישוב מתבסס על שיעור מס של 25% על הרווח הנקי.</li><li>אינו לוקח בחשבון קיזוז הפסדים משנים קודמות.</li><li>מומלץ להתייעץ עם רואה חשבון או יועץ מס לקבלת חישוב מדויק.</li></ul><div class="flex justify-center mt-6"><button id="close-tax-info-btn" class="btn-primary px-6 py-2">הבנתי</button></div></div>`; taxInfoModal.classList.remove('hidden'); $('close-tax-info-btn').onclick = () => taxInfoModal.classList.add('hidden'); });
    exportTradesBtn.addEventListener('click', () => { const toExport = getFilteredTrades(); if (toExport.length === 0) { showMessage("שגיאה", 'אין עסקאות לייצא.'); return; } const dataStr = JSON.stringify(toExport); const script = `<script> const allTrades=${dataStr}; function formatC(n){if(n==null||isNaN(n))return'N/A';const f=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});return n<0?'\\u200e-'+f+'$':'\\u200e'+f+'$'} function calcPL(t){if(t.exit===null||t.exit===undefined||t.exit==='')return null;const e=parseFloat(t.entry),x=parseFloat(t.exit),q=parseFloat(t.quantity),c=parseFloat(t.commission)||0;const g=(t.type||'long')==='long'?(x-e)*q:(e-x)*q;return g-c} function renderT(trades){const b=document.getElementById('trades-tbody');b.innerHTML='';trades.forEach(t=>{const p=calcPL(t);const iC=p!==null?(p>=0?'#16a34a':'#dc2626'):'#facc15';const ind='<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background-color:'+iC+';-webkit-print-color-adjust:exact;print-color-adjust:exact"></span>';const inv=parseFloat(t.entry)*parseFloat(t.quantity);const pP=p!==null&&inv>0?((p/inv)*100).toFixed(2)+'%':'N/A';const r=document.createElement('tr');r.innerHTML='<td>'+ind+'</td><td>'+new Date(t.date).toLocaleDateString('he-IL')+'</td><td>'+t.ticker+'</td><td>'+((t.type||'long')==='long'?'לונג':'שורט')+'</td><td>'+t.quantity+'</td><td>'+formatC(t.entry)+'</td><td>'+formatC(inv)+'</td><td>'+(t.exit?formatC(t.exit):'פתוחה')+'</td><td>'+formatC(t.commission||0)+'</td><td>'+(p!==null?formatC(p):'N/A')+'</td><td>'+pP+'</td>';b.appendChild(r)});const closed=trades.filter(t=>calcPL(t)!==null);const totPL=closed.reduce((s,t)=>s+calcPL(t),0);const tax=totPL>0?totPL*0.25:0;const net=totPL-tax;document.getElementById('summary').innerHTML='<h2 style="font-size:1.5rem;font-weight:700;margin-bottom:1rem">סיכום (לפי סינון)</h2><p><strong>סה"כ רווח/הפסד נטו:</strong> <span style="color:'+(totPL>=0?'#16a34a':'#dc2626')+'">'+formatC(totPL)+'</span></p><p><strong>מס לתשלום (25%):</strong> <span style="color:#dc2626">'+formatC(tax)+'</span></p><p><strong>סה"כ לאחר מס:</strong> <span style="color:'+(net>=0?'#16a34a':'#dc2626')+'">'+formatC(net)+'</span></p>'} function filter(){const t=document.getElementById('filter-ticker').value.toUpperCase(),s=document.getElementById('start-date').value,e=document.getElementById('end-date').value,sort=document.getElementById('sort-trades').value;let f=[...allTrades];if(t)f=f.filter(tr=>tr.ticker.toUpperCase().includes(t));if(s)f=f.filter(tr=>tr.date>=s);if(e)f=f.filter(tr=>tr.date<=e);f.sort((a,b)=>(sort==='date-asc')?new Date(a.date)-new Date(b.date):new Date(b.date)-new Date(a.date));renderT(f)} function clearF(){document.getElementById('filter-ticker').value='';document.getElementById('start-date').value='';document.getElementById('end-date').value='';document.getElementById('sort-trades').selectedIndex=0;filter()} document.addEventListener('DOMContentLoaded',()=>{renderT(allTrades);['filter-ticker','start-date','end-date','sort-trades'].forEach(id=>document.getElementById(id).addEventListener('input',filter));document.getElementById('clear-filter-btn').addEventListener('click',clearF)}) <\/script>`; const headers = ['סטטוס', 'תאריך', 'טיקר', 'סוג', 'כמות', 'כניסה', 'השקעה', 'יציאה', 'עמלה', 'רווח/הפסד נטו', 'תשואה %']; const printBtn = `<div class="print-btn-container"><button onclick="window.print()">הדפס / שמור כ-PDF</button></div>`; const controls = `<div id="controls"><div><label>טיקר</label><input type="text" id="filter-ticker" placeholder="הכל" oninput="this.value=this.value.toUpperCase()"></div><div><label>מתאריך</label><input type="date" id="start-date"></div><div><label>עד תאריך</label><input type="date" id="end-date"></div><div><label>מיין לפי</label><select id="sort-trades"><option value="date-desc">תאריך (חדש לישן)</option><option value="date-asc">תאריך (ישן לחדש)</option></select></div><div><button id="clear-filter-btn">נקה פילטר</button></div></div>`; const finalHtml = `<!DOCTYPE html><html lang="he" dir="rtl"><head><title>דוח עסקאות</title>${getReportStyles()}</head><body>${printBtn}<h1>דוח עסקאות</h1>${controls}<table border="1"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody id="trades-tbody"></tbody></table><div id="summary" class="summary-box"></div>${getStampHTML()}${script}</body></html>`; openReportWindow(finalHtml); });
    exportTransactionsBtn.addEventListener('click', () => { if (transactions.length === 0) { showMessage("שגיאה", 'אין פעולות בחשבון לייצא.'); return; } const rows = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => [ new Date(t.date).toLocaleDateString('he-IL'), t.type === 'deposit' ? 'הפקדה' : 'משיכה', `$${t.amount.toFixed(2)}` ]); const deposits = transactions.filter(t=>t.type==='deposit').reduce((s,t)=>s+t.amount,0), withdrawals = transactions.filter(t=>t.type==='withdraw').reduce((s,t)=>s+t.amount,0), net = deposits-withdrawals; const summary = `<div class="summary-box" style="margin-top:2rem;"><h2 style="font-size:1.5rem;font-weight:700;margin-bottom:1rem">סיכום מאזן</h2><p><strong>סה"כ הפקדות:</strong> <span class="pl-positive">$${deposits.toFixed(2)}</span></p><p><strong>סה"כ משיכות:</strong> <span class="pl-negative">$${withdrawals.toFixed(2)}</span></p><p><strong>מאזן נטו:</strong> <span class="${net>=0?'pl-positive':'pl-negative'}">$${net.toFixed(2)}</span></p></div>`; const printBtn = `<div class="print-btn-container"><button onclick="window.print()">הדפס / שמור כ-PDF</button></div>`; const finalHtml = `<!DOCTYPE html><html lang="he" dir="rtl"><head><title>דוח פעולות בחשבון</title>${getReportStyles()}</head><body>${printBtn}<h1>דוח פעולות בחשבון</h1><table><thead><tr><th>תאריך</th><th>סוג פעולה</th><th>סכום ($)</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>${summary}${getStampHTML()}</body></html>`; openReportWindow(finalHtml); });
    const updateClearFilterButtonVisibility = () => { const isFiltered = currentFilters.ticker || currentFilters.startDate || currentFilters.endDate || currentFilters.plStatus !== 'all' || currentFilters.status !== 'all'; $('clear-filters-btn-list').classList.toggle('hidden', !isFiltered); };
    const clearFilters = () => { 
        currentFilters = { status: 'all', ticker: '', startDate: '', endDate: '', sort: 'date-desc', plStatus: 'all' }; 
        renderTrades(); 
        updateClearFilterButtonVisibility(); 
        if(filterTradesModal) filterTradesModal.classList.add('hidden'); 
    };
    $('show-open-trades-toggle').addEventListener('change', renderTrades);
    filterTradesBtn.addEventListener('click', () => { filterTradesModal.innerHTML = `<div class="card p-8 w-full max-w-lg"><h3 class="text-xl font-semibold mb-6 text-white">סינון ומיון עסקאות</h3><form id="filter-trades-form" class="space-y-4"><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class="block text-sm font-medium mb-1">טיקר</label><input type="text" id="filter-ticker-input" placeholder="הכל" class="input-field w-full" value="${currentFilters.ticker}" oninput="this.value = this.value.toUpperCase()"></div><div><label class="block text-sm font-medium mb-1">מיין לפי</label><select id="filter-sort-select" class="input-field w-full"><option value="date-desc">תאריך (חדש לישן)</option><option value="date-asc">תאריך (ישן לחדש)</option></select></div><div><label class="block text-sm font-medium mb-1">מתאריך</label><input type="date" id="filter-start-date" class="input-field w-full" value="${currentFilters.startDate}"></div><div><label class="block text-sm font-medium mb-1">עד תאריך</label><input type="date" id="filter-end-date" class="input-field w-full" value="${currentFilters.endDate}"></div><div class="md:col-span-2 space-y-2"><label class="block text-sm font-medium mb-1">סטטוס עסקה</label><div class="grid grid-cols-2 gap-2"> <button type="button" data-filter="open" class="status-filter-btn btn-secondary p-2 rounded-lg transition-colors">פתוחות</button> <button type="button" data-filter="profitable" class="status-filter-btn btn-secondary p-2 rounded-lg transition-colors">מרוויחות</button> <button type="button" data-filter="closed" class="status-filter-btn btn-secondary p-2 rounded-lg transition-colors">סגורות</button> <button type="button" data-filter="losing" class="status-filter-btn btn-secondary p-2 rounded-lg transition-colors">מפסידות</button></div></div></div><div class="flex justify-end items-center gap-4 mt-6"><div class="flex-grow"><button type="button" id="clear-filters-btn-modal" class="btn-secondary px-6 py-2">נקה הכל</button></div><div class="flex gap-4"><button type="button" id="cancel-filter-btn" class="btn-secondary px-6 py-2">ביטול</button><button type="submit" class="btn-primary px-6 py-2">החל</button></div></div></form></div>`; filterTradesModal.classList.remove('hidden'); let activeFilter = (currentFilters.status !== 'all' && currentFilters.status !== 'closed') ? currentFilters.status : currentFilters.plStatus; const updateButtons = () => { document.querySelectorAll('.status-filter-btn').forEach(btn => { btn.classList.toggle('pl-filter-btn-active', btn.dataset.filter === activeFilter); }); }; document.querySelectorAll('.status-filter-btn').forEach(btn => { btn.onclick = () => { const filter = btn.dataset.filter; activeFilter = activeFilter === filter ? 'all' : filter; updateButtons(); }; }); updateButtons(); $('filter-sort-select').value = currentFilters.sort; $('cancel-filter-btn').onclick = () => filterTradesModal.classList.add('hidden'); $('clear-filters-btn-modal').onclick = () => { clearFilters(); filterTradesModal.classList.add('hidden'); }; $('filter-trades-form').onsubmit = (e) => { e.preventDefault(); currentFilters.ticker = $('filter-ticker-input').value; currentFilters.startDate = $('filter-start-date').value; currentFilters.endDate = $('filter-end-date').value; currentFilters.sort = $('filter-sort-select').value; if (activeFilter === 'open' || activeFilter === 'closed' || activeFilter === 'all') { currentFilters.status = activeFilter; currentFilters.plStatus = 'all'; } else { currentFilters.status = 'closed'; currentFilters.plStatus = activeFilter; } renderTrades(); updateClearFilterButtonVisibility(); filterTradesModal.classList.add('hidden'); }; });
    
    setupCollapsible('toggle-advanced-data-btn', 'advanced-data-content', 'advanced-data-arrow');
    setupCollapsible('toggle-account-btn', 'account-content', 'account-arrow');
    setupCollapsible('toggle-tax-summary-btn', 'tax-summary-content', 'tax-summary-arrow');
    setupCollapsible('toggle-main-menu-card-btn', 'main-menu-card-content', 'main-menu-card-arrow');
    setupCollapsible('toggle-trade-details-btn', 'trade-details-content', 'trade-details-arrow');
    transactionDateInput.value = getTodaysDate();
    $('trade-date').value = getTodaysDate();
    onAuthStateChanged(auth, handleAuthStateChange);
});