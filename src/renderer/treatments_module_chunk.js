
// --- TREATMENTS MODULE ---

function initTreatmentsModule() {
    const searchInput = document.getElementById('treatment-search');
    const suggestionsBox = document.getElementById('treatment-suggestions');
    const copyBtn = document.getElementById('btn-copy-prescription');

    // Copy Button Logic
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (!currentPatient || !currentPatient.treatments || currentPatient.treatments.length === 0) {
                showNotification('Aucune prescription à copier.', 'warning');
                return;
            }

            const lines = currentPatient.treatments.map(t => {
                return `- ${t.name} : ${t.dosage}, ${t.unit}, ${t.frequency}`;
            });
            const text = `Ordonnance pour ${currentPatient.lastName} ${currentPatient.firstName}:\n\n` + lines.join('\n');

            navigator.clipboard.writeText(text).then(() => {
                showNotification('Ordonnance copiée dans le presse-papier !', 'success');
            }).catch(err => {
                console.error('Copy failed', err);
                showNotification('Erreur lors de la copie.', 'error');
            });
        });
    }

    // Search Logic
    if (searchInput && suggestionsBox) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();

            if (query.length < 2) {
                suggestionsBox.classList.add('hidden');
                suggestionsBox.innerHTML = '';
                return;
            }

            // Filter medications
            const matches = window.MEDICATIONS_DB.filter(m =>
                m.dci.toLowerCase().includes(query) ||
                m.commercialName.toLowerCase().includes(query)
            ).slice(0, 50); // Limit to 50 results

            if (matches.length === 0) {
                suggestionsBox.classList.add('hidden');
                return;
            }

            // Render suggestions
            const html = matches.map((m, index) => `
                <div class="px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0" data-idx="${index}">
                    <div class="font-medium text-gray-800">${m.commercialName} <span class="text-sm font-normal text-gray-500">(${m.dci})</span></div>
                    <div class="text-xs text-gray-400">${m.class}</div>
                </div>
            `).join('');

            suggestionsBox.innerHTML = html;
            suggestionsBox.classList.remove('hidden');

            // Click handlers
            Array.from(suggestionsBox.children).forEach((child, idx) => {
                child.addEventListener('click', () => {
                    const med = matches[idx];
                    addTreatment(med);
                    searchInput.value = '';
                    suggestionsBox.classList.add('hidden');
                });
            });
        });

        // Hide suggestions on click outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                suggestionsBox.classList.add('hidden');
            }
        });
    }
}

// Add Treatment
async function addTreatment(med) {
    if (!currentPatient) {
        showNotification('Veuillez d\'abord créer ou ouvrir un patient.', 'error');
        return;
    }

    if (!currentPatient.treatments) currentPatient.treatments = [];

    const newTreatment = {
        id: Date.now().toString(),
        name: `${med.dci} (${med.commercialName})`,
        dosages: med.dosages, // Store available dosages for dropdown
        dosage: med.dosages[0] || '',
        unit: '1 cp',
        frequency: '1x /J'
    };

    currentPatient.treatments.push(newTreatment);
    await saveTreatmentsData();
    renderTreatmentsList();
    showNotification('Traitement ajouté.', 'success');
}

// Render List
function renderTreatmentsList() {
    const tbody = document.getElementById('treatments-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    const list = currentPatient?.treatments || [];

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400 italic">Aucune prescription active.</td></tr>`;
        return;
    }

    list.forEach((t, index) => {
        const row = document.createElement('tr');

        // Options for Units and Frequencies
        const units = ['1 cp', '2 cp', '3 cp', '4 cp', '1/2 cp', '1/4 cp', 'UI', 'mg', 'ml', 'stylo'];
        const freqs = ['1x /J', '2x /J', '3x /J', '4x /J', '1x /sem', '1x /mois', 'Le soir', 'Le matin', 'Au repas'];

        // Dosage Options
        const dosageOpts = t.dosages ? t.dosages.map(d => `<option value="${d}" ${d === t.dosage ? 'selected' : ''}>${d}</option>`).join('') : `<option value="${t.dosage}">${t.dosage}</option>`;

        // Unit Options
        const unitOpts = units.map(u => `<option value="${u}" ${u === t.unit ? 'selected' : ''}>${u}</option>`).join('');

        // Freq Options
        const freqOpts = freqs.map(f => `<option value="${f}" ${f === t.frequency ? 'selected' : ''}>${f}</option>`).join('');

        row.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-800">${t.name}</td>
            <td class="px-4 py-3">
                <select class="w-full bg-white border border-gray-200 rounded text-sm py-1 px-2 focus:ring-2 focus:ring-blue-100 treatment-input" data-id="${t.id}" data-field="dosage">
                    ${dosageOpts}
                </select>
            </td>
            <td class="px-4 py-3">
                <select class="w-full bg-white border border-gray-200 rounded text-sm py-1 px-2 focus:ring-2 focus:ring-blue-100 treatment-input" data-id="${t.id}" data-field="unit">
                    ${unitOpts}
                </select>
            </td>
            <td class="px-4 py-3">
                <select class="w-full bg-white border border-gray-200 rounded text-sm py-1 px-2 focus:ring-2 focus:ring-blue-100 treatment-input" data-id="${t.id}" data-field="frequency">
                    ${freqOpts}
                </select>
            </td>
            <td class="px-4 py-3 text-right flex justify-end gap-2">
                <button class="text-gray-400 hover:text-blue-600 px-1" onclick="moveTreatment('${t.id}', -1)" title="Monter"><i class="fas fa-chevron-up"></i></button>
                <button class="text-gray-400 hover:text-blue-600 px-1" onclick="moveTreatment('${t.id}', 1)" title="Descendre"><i class="fas fa-chevron-down"></i></button>
                <button class="text-red-400 hover:text-red-600 px-1 ml-2" onclick="deleteTreatment('${t.id}')" title="Supprimer"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;

        tbody.appendChild(row);
    });

    // Attach Listeners to Selects
    document.querySelectorAll('.treatment-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const id = e.target.dataset.id;
            const field = e.target.dataset.field;
            const val = e.target.value;

            const item = currentPatient.treatments.find(t => t.id === id);
            if (item) {
                item[field] = val;
                await saveTreatmentsData(false); // Silent save
            }
        });
    });
}

// Actions
window.deleteTreatment = async (id) => {
    if (!currentPatient) return;
    currentPatient.treatments = currentPatient.treatments.filter(t => t.id !== id);
    await saveTreatmentsData();
    renderTreatmentsList();
};

window.moveTreatment = async (id, direction) => {
    if (!currentPatient || !currentPatient.treatments) return;
    const index = currentPatient.treatments.findIndex(t => t.id === id);
    if (index === -1) return;

    if (direction === -1 && index > 0) {
        // Move Up
        [currentPatient.treatments[index], currentPatient.treatments[index - 1]] = [currentPatient.treatments[index - 1], currentPatient.treatments[index]];
    } else if (direction === 1 && index < currentPatient.treatments.length - 1) {
        // Move Down
        [currentPatient.treatments[index], currentPatient.treatments[index + 1]] = [currentPatient.treatments[index + 1], currentPatient.treatments[index]];
    } else {
        return; // No move possible
    }

    await saveTreatmentsData(false);
    renderTreatmentsList();
};

// Save Logic
async function saveTreatmentsData(notify = true) {
    if (!currentPatient || !currentPatient.db_id) return;

    try {
        await window.electronAPI.updatePatient(currentPatient.db_id, currentPatient);
        if (notify) showNotification('Traitements sauvegardés', 'success');
    } catch (err) {
        console.error('Error saving treatments', err);
        showNotification('Erreur de sauvegarde', 'error');
    }
}

// Load Logic
function loadTreatmentsData(data) {
    if (!currentPatient.treatments) currentPatient.treatments = data || [];
    renderTreatmentsList();
}
