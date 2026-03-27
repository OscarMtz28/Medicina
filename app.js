document.addEventListener('DOMContentLoaded', () => {
  const IS_APP = typeof window.AppInventor !== "undefined";
  console.log("Modo AppInventor:", IS_APP);
  // State
  let medications = JSON.parse(localStorage.getItem('medications')) || [];
  let historyLogs = JSON.parse(localStorage.getItem('historyLogs')) || [];
  let isAuthenticated = false;
  let pendingAction = null;

  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');
  const modal = document.getElementById('med-modal');
  const btnAddMed = document.getElementById('btn-add-med');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const medForm = document.getElementById('med-form');
  const currentDateEl = document.getElementById('current-date');

  // Login DOM Elements
  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const btnCloseLogin = document.getElementById('btn-close-login');
  
  // Custom Dialog Elements
  const dialogOverlay = document.getElementById('dialog-overlay');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogMsg = document.getElementById('dialog-msg');
  const btnDialogCancel = document.getElementById('btn-dialog-cancel');
  const btnDialogOk = document.getElementById('btn-dialog-ok');

  function showAlert(msg, title = 'Atención') {
    dialogTitle.textContent = title;
    dialogMsg.textContent = msg;
    btnDialogCancel.style.display = 'none';
    dialogOverlay.classList.remove('hidden');
    btnDialogOk.onclick = () => dialogOverlay.classList.add('hidden');
  }

  function showConfirm(msg, onOk, title = 'Confirmar') {
    dialogTitle.textContent = title;
    dialogMsg.textContent = msg;
    btnDialogCancel.style.display = 'block';
    dialogOverlay.classList.remove('hidden');
    btnDialogCancel.onclick = () => dialogOverlay.classList.add('hidden');
    btnDialogOk.onclick = () => {
      dialogOverlay.classList.add('hidden');
      onOk();
    };
  }

  // Containers
  const dashboardList = document.getElementById('upcoming-list');
  const medicationsList = document.getElementById('medications-list');
  const historyList = document.getElementById('history-list');

  // Initialize
  updateDate();
  renderAll();

  // Notification / Alarm Logic
  setInterval(checkAlarms, 15000); // Check every minute
  checkAlarms();

  function checkAlarms() {
    const now = Date.now();
    let updated = false;
    medications.forEach(med => {
      if (!med.nextTime) return;
      
      // Check if it's time and we haven't alerted for this specific timestamp
      if (now >= med.nextTime && med.lastAlarmTime !== med.nextTime) {
        triggerAlarm(med);
        med.lastAlarmTime = med.nextTime;
        updated = true;
      }
    });
    if (updated) saveData();
  }

function triggerAlarm(med) {

  const mensaje = `ALARMA|${med.name}|${med.dose}|${med.type}`;

  // Si está dentro de MIT App Inventor
  if (window.AppInventor) {
    window.AppInventor.setWebViewString(mensaje);
  } 
  else {
    // fallback navegador normal
    showAlert(`Hora de tomar ${med.name} (${med.dose} ${med.type})`, '¡Alarma!');
  }
}

  // Request system notification permissions on first interaction


  // Navigation Logic
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active from all
      navItems.forEach(n => n.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      
      // Add active to clicked
      item.classList.add('active');
      const target = document.getElementById(item.dataset.target);
      target.classList.add('active');
    });
  });

  // Auth Logic
  function requireAuth(actionCallback) {
    if (isAuthenticated) {
      actionCallback();
    } else {
      pendingAction = actionCallback;
      loginModal.classList.remove('hidden');
      document.getElementById('login-pass').value = '';
      setTimeout(() => document.getElementById('login-pass').focus(), 100);
    }
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = document.getElementById('login-pass').value;
    if (pass === '1234') {
      isAuthenticated = true;
      loginModal.classList.add('hidden');
      if (pendingAction) {
        pendingAction();
        pendingAction = null;
      }
    } else {
      showAlert('Contraseña incorrecta');
    }
  });

  btnCloseLogin.addEventListener('click', () => {
    loginModal.classList.add('hidden');
    pendingAction = null;
  });

  // Modal Logic
  btnAddMed.addEventListener('click', () => {
    requireAuth(() => {
      document.getElementById('modal-title').textContent = 'Agregar Medicamento';
      medForm.reset();
      document.getElementById('med-id').value = '';
      modal.classList.remove('hidden');
    });
  });

  btnCloseModal.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  // Form Submission (Add/Edit)
  medForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const idField = document.getElementById('med-id').value;
    const medData = {
      id: idField ? idField : Date.now().toString(),
      name: document.getElementById('med-name').value,
      dose: document.getElementById('med-dose').value,
      type: document.getElementById('med-type').value,
      freq: document.getElementById('med-freq').value,
      firstTime: document.getElementById('med-time').value,
      color: document.querySelector('input[name="med-color"]:checked').value,
      desc: document.getElementById('med-desc').value
    };

    if (idField) {
      // Edit mode
      const index = medications.findIndex(m => m.id === idField);
      if (index !== -1) medications[index] = medData;
    } else {
      // Add mode
      medications.push(medData);
      
      // Also calculate initial next pending task based on firstTime
      generatePendingTask(medData);

      if (window.AppInventor) {
        window.AppInventor.setWebViewString(`NUEVO|${medData.name}`);
      }
    }

    saveData();
    renderAll();
    modal.classList.add('hidden');
  });

  function generatePendingTask(med) {
    // If no pending task exists for this med in dash, generate one
    const now = new Date();
    const [hours, minutes] = med.firstTime.split(':');
    let nextDate = new Date();
    nextDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

    // If time passed, advance by frequency until future
    while (nextDate < now) {
      nextDate.setHours(nextDate.getHours() + parseInt(med.freq, 10));
    }

    // Usually we just track nextTime directly in the medication object
    med.nextTime = nextDate.getTime();
  }

  function updateDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    currentDateEl.innerHTML = new Date().toLocaleDateString('es-ES', options);
  }

  // ==== RENDER FUNCTIONS ====

  function renderAll() {
    renderMedications();
    renderDashboard();
    renderHistory();
  }

  function renderMedications() {
    medicationsList.innerHTML = '';
    if (medications.length === 0) {
      medicationsList.innerHTML = `<div class="empty-state">
        <span class="material-symbols-outlined">vaccines</span>
        <h3>No hay medicamentos</h3>
        <p>Toca el botón + para agregar uno.</p>
      </div>`;
      return;
    }

    medications.forEach(med => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--card-color', med.color);
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">
              <span class="material-symbols-outlined" style="color:${med.color}">pill</span>
              ${med.name}
            </div>
            <div class="card-subtitle">${med.dose} ${med.type} • Cada ${med.freq} horas</div>
          </div>
        </div>
        ${med.desc ? `<div class="card-desc">${med.desc}</div>` : ''}
        <div class="card-actions">
          <button class="btn-edit" data-id="${med.id}">
            <span class="material-symbols-outlined">edit</span> Editar
          </button>
          <button class="btn-delete" data-id="${med.id}">
            <span class="material-symbols-outlined">delete</span> Eliminar
          </button>
        </div>
      `;
      medicationsList.appendChild(card);
    });

    // Event Listeners for Edit/Delete
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        requireAuth(() => {
          openEditModal(id);
        });
      });
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        requireAuth(() => {
          showConfirm('¿Eliminar medicamento?', () => {
            medications = medications.filter(m => m.id !== id);
            saveData();
            renderAll();
          });
        });
      });
    });
  }

  function openEditModal(id) {
    const med = medications.find(m => m.id === id);
    if (!med) return;
    
    document.getElementById('modal-title').textContent = 'Editar Medicamento';
    document.getElementById('med-id').value = med.id;
    document.getElementById('med-name').value = med.name;
    document.getElementById('med-dose').value = med.dose;
    document.getElementById('med-type').value = med.type;
    document.getElementById('med-freq').value = med.freq;
    document.getElementById('med-time').value = med.firstTime;
    document.getElementById('med-desc').value = med.desc || '';
    
    const colorRadio = document.querySelector(`input[name="med-color"][value="${med.color}"]`);
    if(colorRadio) colorRadio.checked = true;

    modal.classList.remove('hidden');
  }

  function renderDashboard() {
    dashboardList.innerHTML = '';
    
    // Build upcoming tasks
    const upcoming = [];
    medications.forEach(med => {
      if(!med.nextTime) generatePendingTask(med);
      upcoming.push(med);
    });

    // Sort by next time
    upcoming.sort((a, b) => a.nextTime - b.nextTime);

    if (upcoming.length === 0) {
      dashboardList.innerHTML = `<div class="empty-state">
        <span class="material-symbols-outlined">check_circle</span>
        <h3>Todo al día</h3>
        <p>No tienes tomas pendientes en este momento.</p>
      </div>`;
      return;
    }

    upcoming.forEach(med => {
      const timeObj = new Date(med.nextTime);
      const timeStr = timeObj.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});
      
      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--card-color', med.color);
      
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">
              <span class="material-symbols-outlined" style="color:${med.color}">medication</span>
              ${med.name}
            </div>
            <div class="card-subtitle">${med.dose} ${med.type}</div>
          </div>
          <div class="card-time">${timeStr}</div>
        </div>
        <div class="card-actions" style="margin-top: 0.5rem">
          <button class="btn-postpone" data-id="${med.id}">
            <span class="material-symbols-outlined">schedule</span> Posponer (+1h)
          </button>
          <button class="btn-take" data-id="${med.id}">
            <span class="material-symbols-outlined">check</span> Tomar
          </button>
        </div>
      `;
      dashboardList.appendChild(card);
    });

    // Listeners handles
    document.querySelectorAll('.btn-take').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        handleTake(id);
      });
    });

    document.querySelectorAll('.btn-postpone').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        handlePostpone(id);
      });
    });
  }

  function handleTake(id) {
    const med = medications.find(m => m.id === id);
    if (!med) return;

    if (window.AppInventor) window.AppInventor.setWebViewString(`TOMAR|${med.name}`);

    // Add to history
    const log = {
      id: Date.now().toString(),
      medId: med.id,
      name: med.name,
      dose: med.dose,
      type: med.type,
      color: med.color,
      action: 'tomado', // 'tomado' or 'pospuesto'
      timestamp: Date.now(),
      originalNextTime: med.nextTime // Store so we can undo
    };
    historyLogs.unshift(log); // Add at beginning

    // Setup next intake time
    med.nextTime = med.nextTime + (parseInt(med.freq, 10) * 3600000);
    
    saveData();
    renderAll();
  }

  function handlePostpone(id) {
    const med = medications.find(m => m.id === id);
    if (!med) return;

    if (window.AppInventor) window.AppInventor.setWebViewString(`POSPONER|${med.name}`);

    // Add to history
    const log = {
      id: Date.now().toString(),
      medId: med.id,
      name: med.name,
      dose: med.dose,
      type: med.type,
      color: med.color,
      action: 'pospuesto',
      timestamp: Date.now(),
      originalNextTime: med.nextTime
    };
    historyLogs.unshift(log);

    // Postpone 1 hour
    med.nextTime = med.nextTime + 3600000;

    saveData();
    renderAll();
  }

  function renderHistory() {
    historyList.innerHTML = '';
    
    if (historyLogs.length === 0) {
      historyList.innerHTML = `<div class="empty-state">
        <span class="material-symbols-outlined">receipt_long</span>
        <h3>Sin historial</h3>
        <p>Aquí verás tus tomas pasadas.</p>
      </div>`;
      return;
    }

    historyLogs.forEach(log => {
      const timeStr = new Date(log.timestamp).toLocaleString('es-ES', {
        month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
      });
      
      const isTaken = log.action === 'tomado';
      
      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--card-color', isTaken ? 'var(--success)' : 'var(--warning)');
      
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">
              <span class="material-symbols-outlined" style="color:${log.color}">
                ${isTaken ? 'task_alt' : 'schedule'}
              </span>
              ${log.name}
            </div>
            <div class="card-subtitle">
              ${isTaken ? 'Tomado' : 'Pospuesto'} • ${log.dose} ${log.type}
            </div>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); text-align:right">
            ${timeStr}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-undo" data-id="${log.id}">
            <span class="material-symbols-outlined">undo</span> Deshacer
          </button>
        </div>
      `;
      historyList.appendChild(card);
    });

    document.querySelectorAll('.btn-undo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        handleUndo(id);
      });
    });
  }

  function handleUndo(logId) {
    const logIndex = historyLogs.findIndex(l => l.id === logId);
    if (logIndex === -1) return;

    const log = historyLogs[logIndex];
    const med = medications.find(m => m.id === log.medId);

    // Revert nextTime if med still exists
    if(med && log.originalNextTime) {
      med.nextTime = log.originalNextTime;
    }

    // Remove from history
    historyLogs.splice(logIndex, 1);

    saveData();
    renderAll();
  }

  function saveData() {
    localStorage.setItem('medications', JSON.stringify(medications));
    localStorage.setItem('historyLogs', JSON.stringify(historyLogs));
  }

});
