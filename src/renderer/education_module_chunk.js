
// --- EDUCATION MODULE ---

function initEducationModule() {
    // Diagnostic Auto-Save
    const diagInputs = ['diag-bio', 'diag-psycho', 'diag-social', 'diag-needs'];
    diagInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', debounce(async (e) => {
                if (!currentPatient) return;
                if (!currentPatient.education) currentPatient.education = { diagnostic: {}, plan: [] };
                if (!currentPatient.education.diagnostic) currentPatient.education.diagnostic = {};

                const field = e.target.dataset.field;
                currentPatient.education.diagnostic[field] = e.target.value;
                await saveEducationData();
            }, 1000));
        }
    });

    renderEducationDashboard();
}

// Render Dashboard (Competencies List)
function renderEducationDashboard() {
    const container = document.getElementById('competencies-list');
    if (!container) return;

    container.innerHTML = '';

    // Ensure education object exists
    const plan = currentPatient?.education?.plan || [];

    Object.keys(window.EDUCATION_TOPICS).forEach(key => {
        const topic = window.EDUCATION_TOPICS[key];

        // Calculate Status
        const sessions = plan.filter(s => s.topicKey === key);
        let status = 'ACQUIS';
        let statusClass = 'bg-green-500 text-white';
        let statusLabel = 'ACQUIS';

        if (sessions.length > 0) {
            const allDone = sessions.every(s => s.done);
            if (allDone) {
                status = 'ACQUIS';
                statusClass = 'bg-green-500 text-white';
            } else {
                // Not all done
                if (sessions.length > 1) {
                    status = 'EN COURS';
                    statusClass = 'bg-yellow-400 text-white'; // Or yellow-500 ?
                } else {
                    status = 'NON ACQUIS';
                    statusClass = 'bg-red-500 text-white';
                    statusLabel = 'NON ACQUIS'; // Or just 'NON ACQUIS' matches screenshot
                }
            }
        }

        // Render Item
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 flex items-center justify-center rounded-full bg-white text-lg ${topic.color}">
                    <i class="${topic.icon}"></i>
                </div>
                <span class="font-semibold text-gray-700 text-sm">${topic.label}</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-xs font-bold px-3 py-1 rounded-full ${statusClass} shadow-sm transition-colors duration-300">
                    ${status === 'EN COURS' ? 'EN COURS' : statusLabel}
                </span>
                <button class="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
                        onclick="addEducationSession('${key}')" title="Ajouter une séance">
                    <i class="fas fa-plus text-xs"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });

    renderEducationPlan();
}

// Add Session
async function addEducationSession(topicKey) {
    if (!currentPatient) {
        showNotification('Veuillez ouvrir un patient.', 'error');
        return;
    }

    if (!currentPatient.education) currentPatient.education = { diagnostic: {}, plan: [] };
    if (!currentPatient.education.plan) currentPatient.education.plan = [];

    const topic = window.EDUCATION_TOPICS[topicKey];
    const newSession = {
        id: Date.now().toString(),
        topicKey: topicKey,
        date: new Date().toISOString().split('T')[0],
        session: topic.sessions[0] || '',
        observations: '',
        done: false
    };

    currentPatient.education.plan.push(newSession);
    await saveEducationData();
    renderEducationDashboard(); // Will re-render plan too
}

// Render Plan Table
function renderEducationPlan() {
    const tbody = document.getElementById('education-plan-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const plan = currentPatient?.education?.plan || [];

    if (plan.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">Aucune séance planifiée. Cliquez sur les boutons "+" ci-dessus pour commencer.</td></tr>`;
        return;
    }

    // Sort by date desc ? Or added order ? Let's do added order or date.
    // plan.sort((a,b) => new Date(a.date) - new Date(b.date)); 

    plan.forEach(item => {
        const topic = window.EDUCATION_TOPICS[item.topicKey];
        if (!topic) return; // Should not happen

        const row = document.createElement('tr');
        row.className = item.done ? 'bg-gray-50 opacity-75' : '';

        // Session Options
        const sessionOpts = topic.sessions.map(s => `<option value="${s}" ${s === item.session ? 'selected' : ''}>${s}</option>`).join('');

        row.innerHTML = `
            <td class="px-4 py-3 text-center">
                <input type="checkbox" class="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300 edu-update-done" 
                       data-id="${item.id}" ${item.done ? 'checked' : ''}>
            </td>
            <td class="px-4 py-3 text-center">
                <i class="${topic.icon} ${topic.color} text-lg" title="${topic.label}"></i>
            </td>
            <td class="px-4 py-3">
                <input type="date" class="w-full bg-white border border-gray-200 rounded text-sm py-1 px-2 focus:ring-2 focus:ring-blue-100 edu-update-field" 
                       data-id="${item.id}" data-field="date" value="${item.date}">
            </td>
            <td class="px-4 py-3">
                <select class="w-full bg-white border border-gray-200 rounded text-sm py-1 px-2 focus:ring-2 focus:ring-blue-100 edu-update-field" 
                        data-id="${item.id}" data-field="session">
                    ${sessionOpts}
                </select>
            </td>
            <td class="px-4 py-3">
                <textarea rows="1" class="w-full bg-white border border-gray-200 rounded text-sm py-1 px-2 focus:ring-2 focus:ring-blue-100 resize-none edu-update-field" 
                          data-id="${item.id}" data-field="observations" placeholder="Observations...">${item.observations || ''}</textarea>
            </td>
            <td class="px-4 py-3 text-right">
                <button class="text-gray-400 hover:text-red-600 px-1" onclick="deleteEducationSession('${item.id}')" title="Supprimer">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });

    // Attach Listeners
    document.querySelectorAll('.edu-update-field').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const field = e.target.dataset.field;
            const val = e.target.value;
            updateEducationSession(id, { [field]: val });
        });
    });

    document.querySelectorAll('.edu-update-done').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const checked = e.target.checked;
            updateEducationSession(id, { done: checked });
        });
    });
}

// Update Session
async function updateEducationSession(id, updates) {
    if (!currentPatient?.education?.plan) return;
    const session = currentPatient.education.plan.find(s => s.id === id);
    if (session) {
        Object.assign(session, updates);
        await saveEducationData(false);
        renderEducationDashboard(); // Update status badges
    }
}

// Delete Session
window.deleteEducationSession = async (id) => {
    if (!currentPatient?.education?.plan) return;
    currentPatient.education.plan = currentPatient.education.plan.filter(s => s.id !== id);
    await saveEducationData();
    renderEducationDashboard();
};

// Save Logic
async function saveEducationData(notify = true) {
    if (!currentPatient || !currentPatient.db_id) return;
    try {
        await window.electronAPI.updatePatient(currentPatient.db_id, currentPatient);
        // Only notify if explicit action, maybe silent for inputs
        // if (notify) showNotification('Données éducatives sauvegardées', 'success');
    } catch (err) {
        console.error('Error saving education data', err);
        showNotification('echec sauvegarde éducation', 'error');
    }
}

function loadEducationData(data) {
    // Fill Diagnostic Fields
    const diag = data?.diagnostic || {};
    document.getElementById('diag-bio').value = diag.bio || '';
    document.getElementById('diag-psycho').value = diag.psycho || '';
    document.getElementById('diag-social').value = diag.social || '';
    document.getElementById('diag-needs').value = diag.needs || '';

    renderEducationDashboard(); // Will use currentPatient.education.plan
}
