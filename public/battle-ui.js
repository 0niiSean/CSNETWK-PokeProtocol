const { ipcRenderer } = require('electron');

let connected = false;
let yourTurn = false;
let yourMaxHP = 0;
let opponentMaxHP = 0;

// ===== IPC Listeners =====

ipcRenderer.on('battle-update', (event, data) => {
    if (data.type === 'init') {
        document.getElementById('your-pokemon').textContent = data.yourPokemon.toUpperCase();
        yourMaxHP = data.yourMaxHP;
        updateHP('your', data.yourHP, yourMaxHP);
    } else if (data.type === 'setup') {
        document.getElementById('opponent-pokemon').textContent = data.opponentPokemon.toUpperCase();
        opponentMaxHP = data.opponentMaxHP;
        updateHP('opponent', data.opponentHP, opponentMaxHP);
        updateHP('your', data.yourHP, data.yourMaxHP);
    } else if (data.type === 'damage') {
        updateHP('your', data.yourHP, data.yourMaxHP);
        updateHP('opponent', data.opponentHP, data.opponentMaxHP);
    }
});

ipcRenderer.on('log', (event, data) => {
    addLog(data.message, data.type);
});

ipcRenderer.on('turn-update', (event, data) => {
    updateTurnIndicator(data.isYourTurn);
});

ipcRenderer.on('game-over', (event, data) => {
    const youWon = document.getElementById('your-pokemon').textContent === data.winner.toUpperCase();
    if (youWon) {
        addLog('🎉 YOU WIN!', 'system');
    } else {
        addLog('💀 YOU LOSE!', 'system');
    }
    enableMoveButtons(false);
});

ipcRenderer.on('chat-update', (event, data)=>{
    addChatMessage(data.sender, data.text, data.sticker, data.isSelf);
});

// ===== UI Functions =====

function addChatMessage(sender,text, sticker, isSelf){
    const chatContainer = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');

    msgDiv.classList.add('chat-message');
    msgDiv.classList.add(isSelf ? 'self' : 'opponent');

    const senderSpan = document.createElement('span');
    senderSpan.className = 'sender-name';
    senderSpan.textContent = isSelf ? 'You' : sender;

    if (sticker){
        const img = document.createElement('img');
        img.src = sticker;
        msgDiv.appendChild(senderSpan);
        msgDiv.appendChild(document.createElement('br'));
        msgDiv.appendChild(img);
    }else{
        const textSpan = document.createElement('span');
        textSpan.textContent = text;

        msgDiv.appendChild(senderSpan);
        msgDiv.appendChild(document.createElement('br'));
        msgDiv.appendChild(textSpan);
    }

    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addLog(message, type = 'normal') {
    const log = document.getElementById('battle-log');
    const p = document.createElement('p');
    if (type === 'error') p.classList.add('error');
    if (type === 'system') p.classList.add('system');
    
    const time = new Date().toLocaleTimeString();
    p.textContent = `[${time}] ${message}`;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
}

function updateHP(side, current, max) {
    const hpBar = document.getElementById(`${side}-hp`);
    const hpText = document.getElementById(`${side}-hp-text`);
    const percentage = (current / max) * 100;
    
    hpBar.style.width = percentage + '%';
    hpText.textContent = `${current} / ${max}`;
    
    hpBar.className = 'hp-fill';
    if (percentage < 20) {
        hpBar.classList.add('critical');
    } else if (percentage < 50) {
        hpBar.classList.add('low');
    }
}

function updateTurnIndicator(isYourTurn) {
    const indicator = document.getElementById('turn-indicator');
    yourTurn = isYourTurn;
    
    if (isYourTurn) {
        indicator.textContent = '🎮 YOUR TURN - Choose your move!';
        indicator.className = 'turn-indicator your-turn';
        enableMoveButtons(true);
    } else {
        indicator.textContent = '⏳ OPPONENT\'S TURN - Waiting...';
        indicator.className = 'turn-indicator opponent-turn';
        enableMoveButtons(false);
    }
}

function enableMoveButtons(enabled) {
    document.getElementById('btn-tackle').disabled = !enabled;
    document.getElementById('btn-thunderbolt').disabled = !enabled;
}

// ===== User Actions =====

function startBattle() {
    console.log('startBattle() called!');
    
    const role = document.getElementById('role-select').value;
    const ip = document.getElementById('host-ip').value;
    const port = document.getElementById('host-port').value;

    console.log('Role:', role, 'IP:', ip, 'Port:', port);
    console.log('ipcRenderer:', ipcRenderer);
    console.log('Sending to main process...');
    
    // Send to main process
    ipcRenderer.send('start-battle', { role, ip, port });
    
    console.log('✅ Message sent!');
    
    // Update UI
    document.getElementById('status').classList.remove('disconnected');
    document.getElementById('status').classList.add('connected');
    document.getElementById('status-text').textContent = 'Connected';
    document.getElementById('connect-btn').disabled = true;
    document.getElementById('turn-indicator').textContent = 'Connecting...';
    
    connected = true;
    addLog(`Starting battle as ${role}...`, 'system');
}

function attack(moveName) {
    if (!connected || !yourTurn) return;
    
    // Send to main process
    ipcRenderer.send('attack', moveName);
    
    enableMoveButtons(false);
}

function sendChat(){
    const input = document.getElementById('chat-input-field');
    const text = input.value.trim();

    if(text){
        ipcRenderer.send('send-chat', text);
        input.value = '';
    }

}

document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('sticker-popup');
    const toggleBtn = document.getElementById('btn-sticker-toggle');
    const stickerOptions = document.querySelectorAll('.sticker-option');

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        popup.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        popup.classList.add('hidden');
    });

    stickerOptions.forEach(img => {
        img.addEventListener('click', () => {

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const base64Data = canvas.toDataURL('image/png');

            ipcRenderer.send('send-sticker', base64Data);
        });
    });
});