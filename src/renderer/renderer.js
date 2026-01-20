// import { calculateScore2Diabetes } from './utils/calculations.js'; // Loaded via script tag


let currentPatient = null; // Store full patient object (Global)

// Global Save Helper
async function savePatients() {
    if (!currentPatient || !currentPatient.db_id) return;
    try {
        await window.electronAPI.updatePatient(currentPatient.db_id, currentPatient);
        console.log("Global Save: Success");
    } catch (e) {
        console.error("Global Save: Failed", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('page-title');

    const viewTitles = {
        'dashboard': 'Patients',
        'identity': 'Profil',
        'risks': 'Profil de Risque & Complications',
        'followup': 'Suivi Biologique',
        'exams': 'Examens',
        'treatments': 'Traitements',
        'education': 'ETP',
        'synthesis': 'Synthèse',
        'etp-library': 'Bibliothèque',
        'pharma-book': 'Livret Pharmaceutique'
    };

    // let currentPatient = null; // Moved to global scope
    let saveTimeout = null; // For debounce

    // Helper: Debounce
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // Helper: Update "Nouveau Patient" visibility
    const updateNewPatientButtonVisibility = (targetId) => {
        const btn = document.getElementById('btn-new-patient');
        if (!btn) return;
        if (targetId === 'dashboard') {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    };

    // Global function to handle "Ouvrir" button logic
    const openPatientHandler = async (id, switchView = true) => {
        console.log('Opening patient:', id, 'switchView:', switchView);
        try {
            const patient = await window.electronAPI.getPatient(id);
            if (!patient) {
                console.error('Patient not found');
                showNotification('Patient non trouvé dans la base de données.', 'error');
                return;
            }

            currentPatient = patient;

            // Populate Identity Form
            // Only populate if we are switching view OR if the ID changed (to avoid overwriting user input in progress)
            // But wait, if we just saved "Dupont", the DB has "Dupont". Overwriting "Dupont" with "Dupont" is safe-ish,
            // but if the user typed "Dupontt" in the interim millisecond?
            // Actually, for auto-save, we mainly want to set the CONTEXT (currentPatient, Banner, Nav).
            // We might trust the form values are current since we just saved them.

            if (switchView) {
                document.getElementById('patient-id').value = patient.db_id;
                document.getElementById('inp-lastname').value = patient.lastName || '';
                document.getElementById('inp-firstname').value = patient.firstName || '';
                document.getElementById('inp-birthdate').value = patient.birthDate || '';
                document.getElementById('inp-gender').value = patient.gender || '';
                document.getElementById('inp-diagnosis-year').value = patient.diagnosisYear || '';
                document.getElementById('inp-gp').value = patient.gp || '';

                // Trigger Calculations
                updateAge(patient.birthDate);
                updateDuration(patient.diagnosisYear);

                // Populate Risk Profile
                const p = patient.riskProfile || {};
                const cv = p.cv || {};
                const macro = p.macro || {};
                const micro = p.micro || {};
                const others = p.others || {};

                document.getElementById('risk-hta').value = cv.hta || 'NON';
                document.getElementById('risk-dyslipidemia').value = cv.dyslipidemia || 'NON';
                document.getElementById('risk-tobacco').value = cv.tobacco || 'NON';
                document.getElementById('risk-heredity').value = cv.heredity || 'NON';

                document.getElementById('macro-avc').value = macro.avc || 'NON';
                document.getElementById('macro-coronary').value = macro.coronary || 'NON';
                document.getElementById('macro-aomi').value = macro.aomi || 'NON';
                document.getElementById('macro-stenosis').value = macro.stenosis || 'NON';

                document.getElementById('micro-retino').value = micro.retino || 'NON';
                document.getElementById('micro-nephro').value = micro.nephro || 'NON';
                document.getElementById('micro-neuro-sens').value = micro.neuroSens || 'NON';
                document.getElementById('micro-neuro-auto').value = micro.neuroAuto || 'NON';

                document.getElementById('other-hf').value = others.hf || 'NON';
                document.getElementById('other-afib').value = others.afib || 'NON';
                document.getElementById('other-foot').value = others.foot || 'Grade 0';
                document.getElementById('other-liver').value = others.liver || 'NON';
            }

            // Load Biological Data
            if (patient.biologicalHistory) {
                renderHistoryTable(patient.biologicalHistory);
                renderEvolutionChart(patient.biologicalHistory);
            } else {
                renderHistoryTable([]);
                renderEvolutionChart([]);
            }

            // Load Exams Data
            loadExamsData(patient.exams);

            // Load Treatments Data
            loadTreatmentsData(patient.treatments);

            // Load Education Data
            loadEducationData(patient.education);

            // Load Synthesis Data
            renderSynthesisChart();

            // Enable Navigation
            updateNavigationState(true);

            // Show Active Patient Banner
            const banner = document.getElementById('active-patient-banner');
            const bannerName = document.getElementById('active-patient-name');
            if (banner && bannerName) {
                bannerName.textContent = `${patient.lastName.toUpperCase()} ${patient.firstName}`;
                banner.classList.remove('hidden');
            }

            // Switch to View
            if (switchView) {
                const identityBtn = document.querySelector('[data-target="identity"]'); // Re-added definition
                if (identityBtn) identityBtn.click();
            }
        } catch (err) {
            console.error('Error opening patient:', err);
            showNotification("Erreur lors de l'ouverture du dossier: " + err.message, 'error');
        }
    };
    window.openPatientHandler = openPatientHandler;

    // Close Patient Handler
    const closePatientHandler = () => {
        currentPatient = null;
        updateNavigationState(false);

        // Hide Banner
        const banner = document.getElementById('active-patient-banner');
        if (banner) banner.classList.add('hidden');

        // Go to Dashboard (Patients List)
        document.querySelector('[data-target="dashboard"]').click();
    };

    const btnClosePatient = document.getElementById('btn-close-patient');
    if (btnClosePatient) {
        btnClosePatient.addEventListener('click', closePatientHandler);
    }

    // --- Navigation Logic ---
    const updateNavigationState = (hasPatient) => {
        const patientBtns = document.querySelectorAll('.patient-nav-btn');
        patientBtns.forEach(btn => {
            if (hasPatient) {
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                btn.disabled = false;
            } else {
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                btn.disabled = true;
            }
        });
    };

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.disabled) {
                e.preventDefault();
                return;
            }

            // Guard: Mandatory Fields (Sex/DOB) for Patient Tabs
            const targetId = btn.getAttribute('data-target');
            const patientTabs = ['followup', 'exams', 'treatments', 'education']; // Tabs requiring DFG/Age context

            if (patientTabs.includes(targetId)) {
                const birthDate = document.getElementById('inp-birthdate').value;
                const gender = document.getElementById('inp-gender').value;
                console.log(`Nav Guard: Target=${targetId}, DOB='${birthDate}', Gender='${gender}'`);

                if (!birthDate || !gender) {
                    // alert('Le Sexe et la Date de Naissance sont obligatoires pour accéder à ces onglets.');

                    // Visual Feedback instead of Alert
                    shakeElement('#form-identity'); // Shake the form
                    showNotification('Le Sexe et la Date de Naissance sont obligatoires.', 'error');

                    if (!birthDate) highlightError('inp-birthdate');
                    if (!gender) highlightError('inp-gender');

                    e.preventDefault();
                    e.stopPropagation(); // Stop other handlers

                    // Force switch to Identity tab if not already there
                    const identityBtn = document.querySelector('[data-target="identity"]');
                    if (identityBtn && !identityBtn.classList.contains('active')) {
                        // We must call click() but avoid infinite loop if we monitor clicks differently?
                        // Actually, just letting the logic fall through or manually handling class switch might be safer.
                        // But clicking identity button is logically sound as it triggers the view switch.
                        // However, we are inside a generic click handler.
                        // Better to just return and perhaps highlight the inputs?

                        // Switch view manually to be safe
                        navButtons.forEach(b => b.classList.remove('active'));
                        identityBtn.classList.add('active');
                        views.forEach(v => v.classList.add('hidden'));
                        document.getElementById('view-identity').classList.remove('hidden');
                        document.getElementById('page-title').textContent = viewTitles['identity'];
                    }
                    return;
                }
            }

            // Remove active class from all buttons
            navButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');

            // Hide all views
            views.forEach(v => v.classList.add('hidden'));

            // Show target view
            const targetView = document.getElementById(`view-${targetId}`);
            if (targetView) {
                targetView.classList.remove('hidden');
            }

            // Update page title
            if (viewTitles[targetId]) {
                pageTitle.textContent = viewTitles[targetId];
            }

            // Update New Patient Button Visibility
            updateNewPatientButtonVisibility(targetId);
        });
    });

    // Initialize with Dashboard active and patient tabs disabled
    updateNavigationState(false);
    updateNewPatientButtonVisibility('dashboard');
    document.querySelector('[data-target="dashboard"]').click();

    // --- Data Loading Logic ---
    let allPatients = []; // Store all patients for client-side filtering

    const loadDashboardData = async () => {
        try {
            const patients = await window.electronAPI.getPatients();
            allPatients = patients; // Update local cache
            // updateDashboardStats(patients); // Removed
            updateRecentPatientsTable(patients);
            updateAllPatientsTable(patients); // Initial render of full list
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    };

    // Stats update removed
    /*
    const updateDashboardStats = (patients) => {
        const totalPatients = patients.length;
        const patientsCountEl = document.getElementById('stats-total-patients');
        if (patientsCountEl) patientsCountEl.textContent = totalPatients;
    };
    */

    const updateRecentPatientsTable = (patients) => {
        const tbody = document.getElementById('table-recent-patients');
        if (!tbody) return;

        tbody.innerHTML = ''; // Clear existing rows

        // Sort by updated_at desc and take top 5
        const recentPatients = patients.slice(0, 5);

        if (recentPatients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="px-4 py-8 text-center text-gray-400 italic">
                        Aucun patient enregistré.
                    </td>
                </tr>
            `;
            return;
        }

        recentPatients.forEach(patient => {
            const row = document.createElement('tr');
            const age = patient.birthDate ? calculateAge(patient.birthDate) + ' ans' : '-';
            const lastVisit = patient.updated_at ? new Date(patient.updated_at).toLocaleDateString('fr-FR') : '-';

            row.innerHTML = `
                <td class="px-4 py-3 font-medium text-gray-900">${patient.lastName || ''}</td>
                <td class="px-4 py-3 text-gray-600">${patient.firstName || ''}</td>
                <td class="px-4 py-3 text-gray-500">${age}</td>
                <td class="px-4 py-3 text-gray-500">${patient.gp || '-'}</td>
                <td class="px-4 py-3 text-gray-500">${lastVisit}</td>
                <td class="px-4 py-3 text-right"></td> 
            `;

            // Create button programmatically
            const actionCell = row.querySelector('td:last-child');
            const btn = document.createElement('button');
            btn.className = 'text-blue-600 hover:text-blue-800 transition-colors p-1';
            btn.title = 'Ouvrir le dossier';
            btn.innerHTML = '<i class="fas fa-folder-open fa-lg"></i>';
            btn.addEventListener('click', () => openPatientHandler(patient.db_id));
            actionCell.appendChild(btn);

            tbody.appendChild(row);
        });
    };

    const updateAllPatientsTable = (patients) => {
        const tbody = document.getElementById('table-all-patients');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (patients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">
                        Aucun patient trouvé.
                    </td>
                </tr>
            `;
            return;
        }

        patients.forEach(patient => {
            const row = document.createElement('tr');
            const age = patient.birthDate ? calculateAge(patient.birthDate) + ' ans' : '-';
            const lastVisit = patient.updated_at ? new Date(patient.updated_at).toLocaleDateString('fr-FR') : '-';

            row.innerHTML = `
                <td class="px-4 py-3 font-medium text-gray-900">${patient.lastName || ''}</td>
                <td class="px-4 py-3 text-gray-600">${patient.firstName || ''}</td>
                <td class="px-4 py-3 text-gray-500">${age}</td>
                <td class="px-4 py-3 text-gray-500">${patient.gp || '-'}</td>
                <td class="px-4 py-3 text-gray-500">${lastVisit}</td>
                <td class="px-4 py-3 text-right flex justify-end gap-4"></td>
            `;

            const actionCell = row.querySelector('td:last-child');

            // Open Button
            const btnOpen = document.createElement('button');
            btnOpen.className = 'text-blue-600 hover:text-blue-800 transition-colors p-1';
            btnOpen.title = 'Ouvrir le dossier';
            btnOpen.innerHTML = '<i class="fas fa-folder-open fa-lg"></i>';
            btnOpen.addEventListener('click', () => openPatientHandler(patient.db_id));
            actionCell.appendChild(btnOpen);

            // Delete Button
            const btnDelete = document.createElement('button');
            btnDelete.className = 'text-red-400 hover:text-red-600 transition-colors p-1';
            btnDelete.title = 'Supprimer le dossier';
            btnDelete.innerHTML = '<i class="fas fa-trash-alt fa-lg"></i>';
            btnDelete.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Êtes-vous sûr de vouloir supprimer le dossier de ${patient.lastName} ${patient.firstName} ?`)) {
                    try {
                        await window.electronAPI.deletePatient(patient.db_id);
                        loadDashboardData(); // Refresh list
                    } catch (err) {
                        console.error('Error deleting patient:', err);
                        alert('Erreur lors de la suppression');
                    }
                }
            });
            actionCell.appendChild(btnDelete);

            tbody.appendChild(row);
        });
    };

    // Sorting Logic
    let sortDirection = 'asc';
    const sortBtn = document.getElementById('sort-name');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            // Update icon
            sortBtn.innerHTML = `Nom <i class="fas fa-sort-${sortDirection === 'asc' ? 'alpha-down' : 'alpha-up'} ml-1"></i>`;

            const sorted = [...allPatients].sort((a, b) => {
                const nameA = (a.lastName || '').toLowerCase();
                const nameB = (b.lastName || '').toLowerCase();
                if (nameA < nameB) return sortDirection === 'asc' ? -1 : 1;
                if (nameA > nameB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
            updateAllPatientsTable(sorted);
        });
    }

    // Search Logic
    const searchInput = document.getElementById('dashboard-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allPatients.filter(p =>
                (p.lastName && p.lastName.toLowerCase().includes(term)) ||
                (p.firstName && p.firstName.toLowerCase().includes(term))
            );
            updateAllPatientsTable(filtered);
        });
    }

    // Load data on startup
    loadDashboardData();

    // Refresh data when switching to dashboard
    document.querySelector('[data-target="dashboard"]').addEventListener('click', loadDashboardData);

    // New Patient Button
    const btnNewPatient = document.getElementById('btn-new-patient');
    console.log('New Patient Button found:', !!btnNewPatient);
    if (btnNewPatient) {
        btnNewPatient.addEventListener('click', () => {
            console.log('New Patient button clicked');
            currentPatient = null; // Reset current patient context

            // 1. Clear Form (Identity & Risks)
            document.getElementById('patient-id').value = '';
            const form = document.getElementById('form-identity');
            form.reset();

            // 2. Clear Bio History & Chart
            renderHistoryTable([]);
            renderEvolutionChart([]);

            // 3. Clear Exams
            loadExamsData(null);

            // Explicitly enable all inputs (just in case)
            Array.from(form.elements).forEach(el => {
                el.disabled = false;
                el.readOnly = false;
            });
            document.getElementById('calc-age').textContent = '--';
            document.getElementById('calc-duration').textContent = '--';

            // Hide Banner
            const banner = document.getElementById('active-patient-banner');
            if (banner) banner.classList.add('hidden');

            // Enable Navigation (for new patient context)
            updateNavigationState(true);

            // Switch to Identity View
            const identityBtn = document.querySelector('[data-target="identity"]');
            if (identityBtn) identityBtn.click();
        });
    }

    // Unified Save Function
    const saveIdentityForm = async (notify = true) => {
        const id = document.getElementById('patient-id').value;
        const lastName = document.getElementById('inp-lastname').value.trim();
        const firstName = document.getElementById('inp-firstname').value.trim();

        // If new patient, wait for at least Lastname and Firstname
        if (!id && (!lastName || !firstName)) {
            console.log('Skipping auto-save: Missing name');
            return;
        }

        const patientData = {
            lastName: lastName,
            firstName: firstName,
            birthDate: document.getElementById('inp-birthdate').value,
            gender: document.getElementById('inp-gender').value,
            diagnosisYear: document.getElementById('inp-diagnosis-year').value,
            gp: document.getElementById('inp-gp').value,

            // New Risk Profile Structure
            riskProfile: {
                cv: {
                    hta: document.getElementById('risk-hta').value,
                    dyslipidemia: document.getElementById('risk-dyslipidemia').value,
                    tobacco: document.getElementById('risk-tobacco').value,
                    heredity: document.getElementById('risk-heredity').value
                },
                macro: {
                    avc: document.getElementById('macro-avc').value,
                    coronary: document.getElementById('macro-coronary').value,
                    aomi: document.getElementById('macro-aomi').value,
                    stenosis: document.getElementById('macro-stenosis').value
                },
                micro: {
                    retino: document.getElementById('micro-retino').value,
                    nephro: document.getElementById('micro-nephro').value,
                    neuroSens: document.getElementById('micro-neuro-sens').value,
                    neuroAuto: document.getElementById('micro-neuro-auto').value
                },
                others: {
                    hf: document.getElementById('other-hf').value,
                    afib: document.getElementById('other-afib').value,
                    foot: document.getElementById('other-foot').value,
                    liver: document.getElementById('other-liver').value
                }
            }
        };

        try {
            console.log('Saving patient data...', patientData);

            // Explicit Validation for Manual Save (btn-save-identity)
            // Note: This logic might need to be triggered only on explicit click, 
            // but here we are in a generic save function.
            // Let's assume if ID is missing, we need full name.
            // The top check (line 448) skipped auto-save silently.
            // We should probably check if this was a manual trigger to show toast.
            // For now, let's just leave the silent return for auto-save scenario if it matches line 448.
            // But wait, line 448 already returns.
            if (!id && (!lastName || !firstName)) {
                return;
            }

            let resultId;
            if (id) {
                // Update existing
                await window.electronAPI.updatePatient(parseInt(id), patientData);
                resultId = parseInt(id);
                console.log('Update successful, ID:', resultId);

                // Refresh list logic only needed if we don't reload context, but openPatientHandler handles everything
                loadDashboardData();
            } else {
                // Create new
                resultId = await window.electronAPI.createPatient(patientData);
                console.log('Create successful, new ID:', resultId);

                // CRITICAL: Switch context to the new patient immediately
                // Pass false to 'switchView' to avoid reloading form and losing focus during auto-save
                await openPatientHandler(resultId, false);
            }

            document.getElementById('patient-id').value = resultId;

            // Show success notification
            if (notify) {
                showNotification('Patient enregistré avec succès', 'success');
            }

            // Refresh list (already done if openPatientHandler called, but harmless to call again for dashboard cache)
            if (id) loadDashboardData();

        } catch (err) {
            console.error('Error saving patient:', err);
            if (notify) {
                showNotification('Erreur lors de la sauvegarde du patient', 'error');
            }
        }
    };

    const debouncedSave = debounce(() => {
        saveIdentityForm(false); // Silent auto-save
    }, 1000); // 1 second debounce

    // Save Identity & Risks (Unified) - Manual Button Removed
    // Auto-save logic handles everything.

    // Auto-Save Listeners (Specific Targets to prevent bleeding)
    const identityInputs = [
        'inp-lastname', 'inp-firstname', 'inp-birthdate', 'inp-diagnosis-year',
        'risk-dyslipidemia', 'risk-tobacco', 'risk-heredity',
        'macro-avc', 'macro-coronary', 'macro-aomi', 'macro-stenosis',
        'micro-retino', 'micro-nephro', 'micro-neuro-sens', 'micro-neuro-auto',
        'other-hf', 'other-afib', 'other-foot', 'other-liver',
        'inp-gender', 'inp-gp'
    ];

    identityInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Determine event type based on element type
            const eventType = (el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'input';

            el.addEventListener(eventType, () => {
                if (eventType === 'input') {
                    debouncedSave();
                } else {
                    saveIdentityForm(false); // Immediate save for selects/dates
                }
            });
        }
    });

    // Calculation Listeners (Identity specific)
    const inpBirthdate = document.getElementById('inp-birthdate');
    const inpDiagnosisYear = document.getElementById('inp-diagnosis-year');

    if (inpBirthdate) {
        inpBirthdate.addEventListener('change', (e) => {
            updateAge(e.target.value);
            // specific listener above handles save
        });
    }

    if (inpDiagnosisYear) {
        inpDiagnosisYear.addEventListener('input', (e) => {
            updateDuration(e.target.value);
            // specific listener above handles save
        });
    }

    // Initialize Date Field to Today
    const bioDateInput = document.getElementById('bio-date');
    if (bioDateInput) {
        bioDateInput.valueAsDate = new Date();
    }

    // Initialize Biological Module
    initBiologicalFollowUp();

    // Initialize Exams Module
    initExamsModule();
    initTreatmentsModule();
    initEducationModule();
    initSynthesisModule();
    if (window.initPharmaBook) window.initPharmaBook();
});

// Helper Functions
function updateAge(birthDateStr) {
    const el = document.getElementById('calc-age');
    if (!birthDateStr) {
        el.textContent = '--';
        return;
    }
    const age = calculateAge(birthDateStr);
    el.textContent = age + ' ans';
}

const calculateAge = (birthDate) => {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
};

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- UI Feedback Helpers ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    toast.innerHTML = `
        <i class="fas fa-${icon} text-lg"></i>
        <div class="toast-content">
            <div class="toast-title">${type === 'error' ? 'Erreur' : type === 'success' ? 'Succès' : 'Information'}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function highlightError(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.add('input-error');
        el.addEventListener('input', () => el.classList.remove('input-error'), { once: true });
        el.addEventListener('change', () => el.classList.remove('input-error'), { once: true });
    }
}

function shakeElement(elementIdOrClass) {
    let el = document.getElementById(elementIdOrClass);
    if (!el) el = document.querySelector(elementIdOrClass);

    if (el) {
        el.classList.remove('shake');
        void el.offsetWidth; // Trigger reflow
        el.classList.add('shake');
        setTimeout(() => el.classList.remove('shake'), 500);
    }
}
function updateDuration(yearStr) {
    const el = document.getElementById('calc-duration');
    if (!yearStr) {
        el.textContent = '--';
        return;
    }
    const year = parseInt(yearStr);
    const currentYear = new Date().getFullYear();
    const duration = currentYear - year;
    el.textContent = (duration >= 0 ? duration : 0) + ' ans';
}


// --- Risk Factor Listeners (Trigger Score Update) ---
const riskFactorIds = [
    'risk-hta', 'risk-dyslipidemia', 'risk-tobacco', 'risk-heredity',
    'macro-avc', 'macro-coronary', 'macro-aomi', 'macro-stenosis',
    'micro-retino', 'micro-nephro', 'micro-neuro-sens', 'micro-neuro-auto',
    'other-hf', 'other-af'
];

riskFactorIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', () => {
            // Determine if we need to save?
            // For now, just update the local calculation visual
            calculateScore2Result();
            // Optionally mark Identity form as dirty/unsaved if needed, 
            // but that is handled by Identity module save logic usually.
        });
    }
});

// --- Biological Follow-up Logic ---

let biologicalChart = null;

// Initialize Biological Module
// Flag for editing
let editingEntryIndex = null;

function initBiologicalFollowUp() {
    if (window.hasInitBio) {
        console.warn('Biological module already initialized. Skipping.');
        return;
    }
    window.hasInitBio = true;

    console.log('Initializing Biological Follow-up Module');

    // Helper: Handle Lipid Toggle Logic
    const handleLipidToggle = (btn) => {
        const current = btn.getAttribute('data-unit') || 'g/L';
        const next = current === 'g/L' ? 'mmol/L' : 'g/L';

        // Update Button Text
        btn.innerText = next === 'g/L' ? 'Convertir en mmol/L' : 'Convertir en g/L';
        btn.setAttribute('data-unit', next);

        updateInputLabel('bio-ct', `CT (${next})`);
        updateInputLabel('bio-hdl', `HDL (${next})`);
        updateInputLabel('bio-tg', `TG (${next})`);
        updateInputLabel('bio-ldl', `LDLc (${next})`);

        // Convert Values
        ['bio-ct', 'bio-hdl', 'bio-tg', 'bio-ldl'].forEach(id => {
            const input = document.getElementById(id);
            if (input && input.value !== '' && !isNaN(parseFloat(input.value))) {
                const val = parseFloat(input.value);
                let newVal;

                if (id === 'bio-tg') {
                    if (next === 'mmol/L') newVal = CONVERSION_FACTORS.lipid.tgToMmol(val);
                    else newVal = CONVERSION_FACTORS.lipid.tgToG(val);
                } else {
                    if (next === 'mmol/L') newVal = CONVERSION_FACTORS.lipid.toMmol(val);
                    else newVal = CONVERSION_FACTORS.lipid.toG(val);
                }

                input.value = newVal.toFixed(2);
            }
        });
    };

    // Global Event Delegation for Biological Module
    // Note: Toggle Logic moved to setupUnitToggles() to avoid duplication.
    document.addEventListener('click', (e) => {
        // Debug: Log all clicks to identify target issues
        // console.log('Click detected on:', e.target);

        // Removed duplicate toggle handlers here.
    });

    // Remove old setupUnitToggles call and logic
    // Use centralized toggle logic
    setupUnitToggles();


    // Calculation Listeners
    const calcInputs = [
        'bio-weight', 'bio-height', // BMI
        'bio-creat', // DFG
        'bio-ct', 'bio-hdl', 'bio-tg', // LDL
        'bio-hba1c', 'bio-rac', // SCORE2-Diabetes
        'bio-sys', 'bio-dia' // SCORE2-Diabetes (BP)
    ];

    calcInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Use 'change' event instead of 'input' to prevent typing blocking/locking issues.
            // This ensures calculations run only after the user has finished typing (Enter or Tab/Blur).
            el.addEventListener('change', updateBiologicalCalculations);
        }
    });

    // Add Button
    const btnAdd = document.getElementById('btn-add-bio');
    if (btnAdd) {
        btnAdd.addEventListener('click', addBiologicalEntry);
    }

    // Clear Button
    const btnClear = document.getElementById('btn-clear-bio');
    if (btnClear) {
        btnClear.addEventListener('click', clearBiologicalInputs);
    }

    // Chart Metric Select
    const chartSelect = document.getElementById('chart-metric-select');
    if (chartSelect) {
        chartSelect.addEventListener('change', () => {
            if (currentPatient && currentPatient.biologicalHistory) {
                renderEvolutionChart(currentPatient.biologicalHistory);
            }
        });
    }

    // SCORE2-D Info Button
    const scoreInfoBtn = document.getElementById('score2d-info-btn');
    if (scoreInfoBtn) {
        scoreInfoBtn.addEventListener('click', showScore2DModal);
    }

    // Close Modal
    const closeBtn = document.getElementById('close-score2d-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('score2d-modal').classList.add('hidden');
        });
    }

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('score2d-modal');
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

// CONVERSION_FACTORS Removed (Consolidated into UNIT_CONVERSION)



function updateInputLabel(inputId, newText) {
    const input = document.getElementById(inputId);
    if (input && input.nextElementSibling && input.nextElementSibling.classList.contains('floating-label')) {
        input.nextElementSibling.textContent = newText;
    }
}

function clearInput(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.value = '';
        input.parentElement.classList.remove('is-calculated');
    }
}

function updateBiologicalCalculations() {
    calculateBMI();
    calculateDFG();
    calculateNonHDL(); // New calculation
    calculateLDL();
    calculateSCORE2Diabetes();
}

function calculateBMI() {
    const weight = parseFloat(document.getElementById('bio-weight').value);
    const height = parseFloat(document.getElementById('bio-height').value);
    const bmiInput = document.getElementById('bio-bmi');

    if (weight > 0 && height > 0) {
        const heightM = height / 100;
        const bmi = weight / (heightM * heightM);
        bmiInput.value = bmi.toFixed(1);
    } else {
        bmiInput.value = '';
    }
}

function calculateDFG() {
    const creatInput = document.getElementById('bio-creat');
    const creat = parseFloat(creatInput.value);
    const dfgInput = document.getElementById('bio-dfg');

    // Need age and gender from currentPatient or inputs
    let age = 0;
    let gender = 'M';

    if (currentPatient) {
        age = calculateAge(currentPatient.birthDate);
        gender = currentPatient.gender;
    } else {
        const birthDate = document.getElementById('inp-birthdate').value;
        age = calculateAge(birthDate);
        gender = document.getElementById('inp-gender').value;
    }

    if (creat > 0 && age > 0) {
        // Check Unit
        const unitBtn = document.getElementById('toggle-unit-creat');
        const unit = unitBtn ? unitBtn.getAttribute('data-unit') : 'µmol/L';

        // CKD-EPI 2021 Formula
        // Formula uses Scr in mg/dL.

        let creatMgDL;
        if (unit === 'µmol/L') {
            creatMgDL = creat / 88.4;
        } else if (unit === 'mg/L') {
            creatMgDL = creat / 10;
        } else {
            creatMgDL = creat;
        }

        let k = 0.9;
        let alpha = -0.302;
        let f = 1; // male factor

        if (gender === 'F') {
            k = 0.7;
            alpha = -0.241;
            f = 1.012; // female factor
        }

        const dfg = 142 * Math.pow(Math.min(creatMgDL / k, 1), alpha) * Math.pow(Math.max(creatMgDL / k, 1), -1.200) * Math.pow(0.9938, age) * f;

        dfgInput.value = Math.round(dfg);
    } else {
        dfgInput.value = '';
    }
}

// Refactored LDL Calc (Always Base g/L internal)
function calculateLDL() {
    const unitLipid = getActiveUnit('lipid');

    // Get Normalized (g/L) values
    const ctVal = parseFloat(document.getElementById('bio-ct').value);
    const hdlVal = parseFloat(document.getElementById('bio-hdl').value);
    const tgVal = parseFloat(document.getElementById('bio-tg').value);

    // Normalize if needed
    const ct = normalizeValue(ctVal, 'lipid', unitLipid);
    const hdl = normalizeValue(hdlVal, 'lipid', unitLipid);
    // User requested generic factor for TG to align with their expectations (1.5 -> 3.88)
    const tg = normalizeValue(tgVal, 'lipid', unitLipid);

    const ldlInput = document.getElementById('bio-ldl');

    if (ct > 0 && hdl > 0 && tg > 0) {
        // Friedewald (g/L)
        const ldlBase = ct - hdl - (tg / 5);
        // Convert back to Active Unit
        ldlInput.value = formatValueForDisplay(ldlBase, 'lipid', unitLipid);
        ldlInput.parentElement.classList.add('is-calculated');
    } else {
        ldlInput.value = '';
        ldlInput.parentElement.classList.remove('is-calculated');
    }
}

function calculateSCORE2Diabetes() {
    const scoreInput = document.getElementById('bio-score2d');
    const alertContainer = document.getElementById('score2dAlertContainer');

    // --- 1. GATHER INPUTS ---

    // Patient Data
    if (!currentPatient || !currentPatient.birthDate || !currentPatient.gender) {
        scoreInput.value = '';
        return;
    }

    const age = calculateAge(currentPatient.birthDate);
    // Note: Validation (Age 40-69) is handled inside the utility, returning null if invalid. 
    // But we might want UI feedback like "N/A (Age)".
    // Let's rely on the utility return.

    const gender = currentPatient.gender; // 'M' or 'F'

    // Smoking
    const smokingVal = document.getElementById('risk-tobacco').value;
    const isSmoker = (smokingVal === 'OUI');

    // Clinical Inputs
    const sbp = parseFloat(document.getElementById('bio-sys').value);

    // Lipids: Ensure mmol/L
    let ctVal = parseFloat(document.getElementById('bio-ct').value);
    let hdlVal = parseFloat(document.getElementById('bio-hdl').value);

    // Check units via Labels (robust enough for this context)
    const ctLabel = document.getElementById('bio-ct').nextElementSibling ? document.getElementById('bio-ct').nextElementSibling.textContent : '';
    const isCtMg = !ctLabel.includes('mmol/L'); // If label doesn't say mmol/L, assume g/L (default)

    if (isCtMg && !isNaN(ctVal)) {
        ctVal = ctVal * 2.586; // g/L -> mmol/L
    }

    const hdlLabel = document.getElementById('bio-hdl').nextElementSibling ? document.getElementById('bio-hdl').nextElementSibling.textContent : '';
    const isHdlMg = !hdlLabel.includes('mmol/L');

    if (isHdlMg && !isNaN(hdlVal)) {
        hdlVal = hdlVal * 2.586; // g/L -> mmol/L
    }

    // HbA1c (%)
    const hba1c = parseFloat(document.getElementById('bio-hba1c').value);

    // eGFR
    const eGFR = parseFloat(document.getElementById('bio-dfg').value);

    // Age at Diagnosis
    // Prefer calculation from Diagnosis Year
    const diagYear = parseInt(document.getElementById('inp-diagnosis-year').value);
    let ageDiag;
    if (!isNaN(diagYear)) {
        const birthYear = new Date(currentPatient.birthDate).getFullYear();
        ageDiag = diagYear - birthYear;
    } else {
        // Validation check will fail inside utility if passed as undefined/NaN
        ageDiag = null;
    }

    // --- 2. CALL UTILITY ---
    try {
        if (typeof window.calculateScore2Diabetes !== 'function') {
            console.error("calculateScore2Diabetes is not defined");
            scoreInput.value = 'Err:Fn';
            return;
        }

        const riskInputs = {
            age,
            gender,
            isSmoker,
            sbp,
            cholTotal: ctVal,
            cholHdl: hdlVal,
            hba1cPerc: hba1c,
            eGFR: eGFR,
            ageDiagnosis: ageDiag
        };

        const result = window.calculateScore2Diabetes(riskInputs);

        // --- 2.5 AUTO-UPDATE NEPHROPATHY ---
        autoUpdateNephropathy(eGFR);

        // --- 3. ADVANCED RISK ASSESSMENT (OVERRIDE) ---
        // Check for Very High Risk conditions (ASCVD, Severe TOD)
        const isVeryHighRisk = assessVeryHighRisk(eGFR);

        // --- 4. DISPLAY RESULT & ICON LOGIC ---

        // Check Missing Data first (Grey ?)
        if ([age, sbp, ctVal, hdlVal, hba1c, eGFR, ageDiag].some(v => v === null || isNaN(v))) {
            scoreInput.value = '';
            scoreInput.title = "Données manquantes pour le calcul";
            scoreInput.parentElement.classList.remove('is-calculated');
            scoreInput.style.color = '';
            updateRiskStatusIcon('missing');
            return; // Stop here if data missing
        }

        // Check Override (Red !)
        if (isVeryHighRisk) {
            scoreInput.value = 'T. Élevé';
            scoreInput.style.color = '#dc2626'; // Red
            scoreInput.parentElement.classList.add('is-calculated');
            updateRiskStatusIcon('override');
            return;
        }

        // Check Age Eligibility (Orange !)
        // Model valid 40-69. (Note: calculations.js says >=70 excludes).
        // If result is null because of age:
        if (result === null || age < 40 || age > 69) {
            scoreInput.value = 'N/A';
            scoreInput.title = "Age hors limites (40-69 ans)";
            scoreInput.parentElement.classList.remove('is-calculated');
            scoreInput.style.color = '';
            updateRiskStatusIcon('ineligible'); // Orange
            return;
        }

        // Success (Green Check or Blue Info?)
        // Let's use a Check or just standard Info. 
        // User asked for specific icons for failure. 
        // For success, let's show a subtle check to indicate "Calculation OK".
        scoreInput.value = result.toFixed(1) + ' %';
        scoreInput.style.color = getScoreColorClass(result); // Use score color for text
        scoreInput.parentElement.classList.add('is-calculated');
        updateRiskStatusIcon('success');

    } catch (err) {
        console.error("SCORE2 Calculation Error:", err);
        scoreInput.value = '';
    }
}

// --- ICON HELPER ---
function updateRiskStatusIcon(state) {
    const icon = document.getElementById('score2d-status-icon');
    const btn = document.getElementById('score2d-status-btn');
    if (!icon || !btn) return;

    // Reset basics
    icon.className = 'fas text-lg';

    switch (state) {
        case 'missing':
            icon.classList.add('fa-question', 'text-gray-400');
            btn.title = "Données manquantes pour le calcul";
            break;
        case 'ineligible':
            icon.classList.add('fa-exclamation', 'text-orange-500');
            btn.title = "Non éligible (Age)";
            break;
        case 'override':
            icon.classList.add('fa-exclamation', 'text-red-600');
            btn.title = "Risque Très Élevé (Override)";
            break;
        case 'success':
            icon.classList.add('fa-check', 'text-green-500');
            btn.title = "Calcul effectué avec succès";
            break;
    }
}

// --- AUTO-UPDATE LOGIC ---
function autoUpdateNephropathy(eGFR) {
    if (eGFR < 60) {
        const nephroSelect = document.getElementById('micro-nephro');
        if (nephroSelect && nephroSelect.value !== 'OUI') {
            nephroSelect.value = 'OUI';
            // Trigger visual alert
            const alertIcon = document.getElementById('identity-alert-icon');
            if (alertIcon) {
                alertIcon.classList.remove('hidden');
                // Set Tooltip as requested
                alertIcon.title = "Mise à jour automatique : 'Néphropathie' passée à OUI car le DFG est < 60 ml/min.";
            }
        }
    }
}

// --- RISK ASSESSMENT UTILS ---
function assessVeryHighRisk(eGFR) {
    // 1. ASCVD (Macrovascular)
    // Check if any Macrovascular condition is 'OUI'
    const macroIds = ['macro-coronary', 'macro-aomi', 'macro-stenosis', 'macro-avc'];
    const hasASCVD = macroIds.some(id => document.getElementById(id).value === 'OUI');

    if (hasASCVD) return true;

    // 2. Severe TOD (Target Organ Damage)
    // Criteria i: eGFR < 45
    if (eGFR < 45) return true;

    // RAC Handling (Active Unit to mg/g Base)
    // We need normalized RAC in mg/g.
    const racInput = document.getElementById('bio-rac').value;
    const racUnit = getActiveUnit('rac');
    let racVal = 0;
    if (racInput) {
        const raw = parseFloat(racInput);
        racVal = normalizeValue(raw, 'rac', racUnit);
    }

    // Criteria ii: eGFR 45-59 AND Microalbuminuria (A2: 30-300 mg/g)
    if (eGFR >= 45 && eGFR <= 59 && racVal >= 30 && racVal <= 300) return true;

    // Criteria iii: Proteinuria (A3: > 300 mg/g)
    if (racVal > 300) return true;

    // Criteria iv: 3+ Microvascular sites
    // Sites: Retinopathy, Nephropathy, Neuro Sensitive, Neuro Autonome
    const microIds = ['micro-retino', 'micro-nephro', 'micro-neuro-sens', 'micro-neuro-auto'];
    const microCount = microIds.filter(id => document.getElementById(id).value === 'OUI').length;

    if (microCount >= 3) return true;

    return false;
}

// --- AUTO-UPDATE LOGIC ---
function autoUpdateNephropathy(eGFR) {
    if (eGFR < 60) {
        const nephroSelect = document.getElementById('micro-nephro');
        if (nephroSelect && nephroSelect.value !== 'OUI') {
            nephroSelect.value = 'OUI';
            // Trigger visual alert
            const alertIcon = document.getElementById('identity-alert-icon');
            if (alertIcon) {
                alertIcon.classList.remove('hidden');
            }
            // Trigger save? Or just wait for user actions?
            // Usually form requires manual save, but we modified the view.
        }
    }
}

// Clear alert on tab visit
document.addEventListener('DOMContentLoaded', () => {
    // --- Score2D Status Button ---
    const scoreStatusBtn = document.getElementById('score2d-status-btn');
    if (scoreStatusBtn) {
        scoreStatusBtn.addEventListener('click', showScore2DModal);
    }

    const outputIdentityBtn = document.querySelector('[data-target="identity"]'); // Sidebar btn
    if (outputIdentityBtn) {
        outputIdentityBtn.addEventListener('click', () => {
            const alertIcon = document.getElementById('identity-alert-icon');
            if (alertIcon) alertIcon.classList.add('hidden');
        });
    }
});

function calculateNonHDL() {
    const unitLipid = getActiveUnit('lipid');

    // Get Normalized values
    const ctVal = parseFloat(document.getElementById('bio-ct').value);
    const hdlVal = parseFloat(document.getElementById('bio-hdl').value);

    const ct = normalizeValue(ctVal, 'lipid', unitLipid);
    const hdl = normalizeValue(hdlVal, 'lipid', unitLipid);

    const el = document.getElementById('bio-nonhdl');

    if (ct > 0 && hdl > 0) {
        const valBase = ct - hdl;
        // Prevent negative results
        if (valBase < 0) {
            el.value = '';
            el.parentElement.classList.remove('is-calculated');
        } else {
            el.value = formatValueForDisplay(valBase, 'lipid', unitLipid);
            el.parentElement.classList.add('is-calculated');
        }
    } else {
        el.value = '';
        el.parentElement.classList.remove('is-calculated');
    }
}

// --- UNIT CONVERSION HELPERS ---
// --- UNIT CONVERSION HELPERS ---
// (Moved below to consolidate)
// Note: Logic in normalizeValue is: if (current != base) return value / factor. 
// My logic above defined factors as "TO BASE".
// normalizeValue currently says: value / factor.
// If I define factor as "FROM BASE", then dividing converts TO base?
// Let's stick to existing code structure which worked for others but failed for Creat because of Base def.

// Original: 'creat': { base: 'µmol/L', factors: { 'mg/dL': 0.0113 } }
// Original logic: if current (mg/dL) != base (µmol). factor = 0.0113. 
// return value / 0.0113. 
// 1 mg/dL / 0.0113 = 88.4 µmol/L. Correct.

// NEW PLAN:
// We WANT Base to be mg/L (matches table assumption).
// 'creat': { base: 'mg/L', factors: { 'µmol/L': 8.84 } }
// normalizeValue check: current(µmol) != base(mg/L).
// factor = 8.84.
// return value (100) / 8.84 = 11.3 mg/L. Correct.

// RAC:
// Base = mg/g.
// factor for mg/mmol?
// 1 mg/mmol = 8.84 mg/g.
// So I should MULTIPLY to get base.
// existing `normalizeValue` DIVIDES.
// So factor should be 1/8.84 = 0.113.
// 'rac': { base: 'mg/g', factors: { 'mg/mmol': 0.113 } }
// Input 25 mg/mmol / 0.113 = 221 mg/g. Correct.

// Lipids:
// Base = g/L.
// factor for mmol/L?
// 1 mmol/L = 1/2.586 g/L = 0.387 g/L.
// 'lipid': { base: 'g/L', factors: { 'mmol/L': 2.586 } }
// Wait, existing was: { 'mmol/L': 2.586 }
// normalizeValue: val(mmol) / 2.586.
// 2.586 mmol = 1 g. 
// Input 2.586 mmol / 2.586 = 1 g. Correct.
// So for Lipids, factor is "How many derived units make 1 base unit".

// So for Creat:
// Base = mg/L.
// How many µmol/L make 1 mg/L?
// 8.84 µmol/L = 1 mg/L.
// So factor = 8.84.
// 'creat': { base: 'mg/L', factors: { 'µmol/L': 8.84 } }
// Input 100 µmol / 8.84 = 11.3 mg. Correct.

// So code update:
const UNIT_CONVERSION = {
    'creat': { base: 'mg/L', factors: { 'µmol/L': 8.84 } },
    'rac': { base: 'mg/g', factors: { 'mg/mmol': 0.113 } }, // 1 mg/mmol = 8.84 mg/g. So ratio is 0.113? No.
    // normalizeValue divides.
    // We want mg/mmol -> mg/g.
    // 1 mg/mmol = 8.84 mg/g.
    // val(mmol) * 8.84 = val(g).
    // val(mmol) / (1/8.84) = val(g).
    // So factor should be 0.113.
    // Let's check RAC again.
    // 1 mg/g approx 0.113 mg/mmol.
    // So if I have 25 mg/mmol.  25 / 0.113 = 221 mg/g. Correct.

    'lipid': { base: 'g/L', factors: { 'mmol/L': 2.586 } },
    'tg': { base: 'g/L', factors: { 'mmol/L': 1.144 } } // TG specific factor (approx 1000/875)
};

function getActiveUnit(type) {
    // Simplified logic: Direct ID lookup since we have single toggle buttons
    const btn = document.getElementById(`toggle-unit-${type}`);
    // If button exists, its data-unit attribute represents the CURRENT selected unit (after toggle logic updates it)
    // Actually, handleLipidToggle updates data-unit to the "next" state which becomes the "current" state.
    // So reading data-unit is correct.
    // Default to base if button not found or attribute missing.
    return btn ? (btn.getAttribute('data-unit') || UNIT_CONVERSION[type].base) : UNIT_CONVERSION[type].base;
}

function normalizeValue(value, type, currentUnit) {
    if (!value) return null;
    const rules = UNIT_CONVERSION[type];
    if (currentUnit === rules.base) return value;

    // Convert TO base
    const factor = rules.factors[currentUnit];
    if (factor) return value / factor;
    return value;
}

function formatValueForDisplay(value, type, targetUnit) {
    if (value === null || value === undefined) return '';
    const rules = UNIT_CONVERSION[type];
    if (targetUnit === rules.base) {
        // Even for base, round nicely to avoid Float errors (e.g. 1.1 + 0.2 = 1.300000001)
        if (type === 'rac') return Math.round(value).toFixed(0);
        return parseFloat(value.toFixed(2));
    }

    // Convert FROM base
    const factor = rules.factors[targetUnit];
    if (factor) {
        const res = value * factor;
        if (type === 'rac') {
            return Math.round(res).toFixed(0);
        }
        return parseFloat(res.toFixed(2));
    }
    return value;
}

async function addBiologicalEntry() {
    if (!currentPatient) {
        showNotification("Veuillez d'abord sélectionner un patient.", 'error');
        shakeElement('#table-recent-patients');
        return;
    }

    // Capture current units
    const unitLipid = getActiveUnit('lipid');
    const unitCreat = getActiveUnit('creat');
    const unitRac = getActiveUnit('rac');

    const entry = {
        date: document.getElementById('bio-date').value || new Date().toISOString().split('T')[0],
        hba1c: parseFloat(document.getElementById('bio-hba1c').value) || null,
        weight: parseFloat(document.getElementById('bio-weight').value) || null,
        height: parseFloat(document.getElementById('bio-height').value) || null,
        bmi: parseFloat(document.getElementById('bio-bmi').value) || null,

        // Normalize to Base Units (µmol/L, mg/g, g/L)
        creat: normalizeValue(parseFloat(document.getElementById('bio-creat').value), 'creat', unitCreat),
        rac: normalizeValue(parseFloat(document.getElementById('bio-rac').value), 'rac', unitRac),

        dfg: parseFloat(document.getElementById('bio-dfg').value) || null, // DFG is unitless (standardized)

        ct: normalizeValue(parseFloat(document.getElementById('bio-ct').value), 'lipid', unitLipid),
        hdl: normalizeValue(parseFloat(document.getElementById('bio-hdl').value), 'lipid', unitLipid),
        tg: normalizeValue(parseFloat(document.getElementById('bio-tg').value), 'lipid', unitLipid),
        nonHdl: normalizeValue(parseFloat(document.getElementById('bio-nonhdl').value), 'lipid', unitLipid),
        ldl: normalizeValue(parseFloat(document.getElementById('bio-ldl').value), 'lipid', unitLipid),

        sys: parseInt(document.getElementById('bio-sys').value) || null,
        dia: parseInt(document.getElementById('bio-dia').value) || null,
        score2d: document.getElementById('bio-score2d').value || null
    };

    // Initialize history if not exists
    if (!currentPatient.biologicalHistory) {
        currentPatient.biologicalHistory = [];
    }

    if (editingEntryIndex !== null) {
        currentPatient.biologicalHistory[editingEntryIndex] = entry;
        editingEntryIndex = null;
        document.getElementById('btn-add-bio').innerHTML = '<i class="fas fa-plus"></i> Ajouter';
        showNotification('Bilan modifié avec succès', 'success');
    } else {
        currentPatient.biologicalHistory.push(entry);
        showNotification('Bilan ajouté avec succès', 'success');
    }

    currentPatient.biologicalHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

    try {
        await window.electronAPI.updatePatient(currentPatient.db_id, {
            biologicalHistory: currentPatient.biologicalHistory
        });

        renderHistoryTable(currentPatient.biologicalHistory);
        renderEvolutionChart(currentPatient.biologicalHistory);

        clearBiologicalInputs();
        showNotification('Bilan biologique sauvegardé', 'success');
    } catch (err) {
        console.error('Error saving biological data:', err);
        showNotification('Erreur lors de la sauvegarde du bilan', 'error');
    }
}

// function clearBiologicalInputs
function clearBiologicalInputs() {
    const inputs = [
        'bio-date', 'bio-weight', 'bio-height', 'bio-bmi',
        'bio-hba1c',
        'bio-ct', 'bio-hdl', 'bio-tg', 'bio-nonhdl', 'bio-ldl',
        'bio-creat', 'bio-dfg', 'bio-rac',
        'bio-sys', 'bio-dia',
        'bio-score2d'
    ];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = '';
            el.parentElement.classList.remove('is-calculated');
        }
    });

    // Reset date to today
    const dateInput = document.getElementById('bio-date');
    if (dateInput) dateInput.valueAsDate = new Date();

    // Reset Button
    const btnAdd = document.getElementById('btn-add-bio');
    if (btnAdd) btnAdd.innerHTML = '<i class="fas fa-plus"></i> Ajouter';

    editingEntryIndex = null;
    updateRiskStatusIcon('missing');
}

// ... active unit helper required for display ...

window.editBiologicalEntry = function (index) {
    if (!currentPatient || !currentPatient.biologicalHistory) return;
    const entry = currentPatient.biologicalHistory[index];
    if (!entry) return;

    // Detect current UI units
    const unitLipid = getActiveUnit('lipid');
    const unitCreat = getActiveUnit('creat');
    const unitRac = getActiveUnit('rac');

    // Populate fields with conversion
    document.getElementById('bio-date').value = entry.date;
    document.getElementById('bio-weight').value = entry.weight || '';
    document.getElementById('bio-height').value = entry.height || '';

    document.getElementById('bio-hba1c').value = entry.hba1c || '';

    // Convert stored base unit -> active UI unit
    document.getElementById('bio-creat').value = formatValueForDisplay(entry.creat, 'creat', unitCreat);

    document.getElementById('bio-rac').value = formatValueForDisplay(entry.rac, 'rac', unitRac);

    document.getElementById('bio-ct').value = formatValueForDisplay(entry.ct, 'lipid', unitLipid);
    document.getElementById('bio-hdl').value = formatValueForDisplay(entry.hdl, 'lipid', unitLipid);
    document.getElementById('bio-tg').value = formatValueForDisplay(entry.tg, 'lipid', unitLipid);

    // Trigger calc will handle derived/read-only (NonHDL, LDL, DFG, Score)
    // But setting inputs allows them to be recalculated correctly.

    document.getElementById('bio-sys').value = entry.sys || '';
    document.getElementById('bio-dia').value = entry.dia || '';

    // Update derived calculations immediately
    updateBiologicalCalculations();

    editingEntryIndex = index;
    document.getElementById('btn-add-bio').innerHTML = '<i class="fas fa-save"></i> Modifier';

    document.querySelector('.input-group-container').scrollIntoView({ behavior: 'smooth' });
};

function setupUnitToggles() {
    const toggles = document.querySelectorAll('.unit-toggle');

    toggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            // Get current state
            const currentUnit = toggle.getAttribute('data-unit');
            const type = toggle.id.replace('toggle-unit-', '');

            // Determine next state
            let nextUnit;
            if (type === 'creat') {
                nextUnit = (currentUnit === 'µmol/L') ? 'mg/L' : 'µmol/L';
            } else if (type === 'lipid') {
                nextUnit = (currentUnit === 'g/L') ? 'mmol/L' : 'g/L';
            } else if (type === 'rac') {
                nextUnit = (currentUnit === 'mg/mmol') ? 'mg/g' : 'mg/mmol'; // Standard is mg/mmol -> mg/g
            }

            // Update internal state
            toggle.setAttribute('data-unit', nextUnit);
            toggle.innerText = `Convertir en ${currentUnit}`; // Button shows what clicking will do (return to previous)

            // Update UI & Values
            if (type === 'creat') {
                const input = document.getElementById('bio-creat');
                input.nextElementSibling.textContent = `Créatinine (${nextUnit})`;

                if (input.value) {
                    const val = parseFloat(input.value);
                    // Convert: If next is Base (mg/L), normalize current derived. If next is Derived, format from Base.
                    // Simplified: We have helpers in UNIT_CONVERSION but they are generic.

                    // Logic: VAL is in CURRENT unit. We want NEXT unit.
                    // If Current=µmol (Derived), Next=mg (Base). Factor 8.84. Val / 8.84.
                    // If Current=mg (Base), Next=µmol (Derived). Factor 8.84. Val * 8.84.

                    const factor = UNIT_CONVERSION['creat'].factors['µmol/L']; // 8.84
                    let newVal;

                    if (nextUnit === 'mg/L') { // To Base
                        newVal = val / factor;
                        input.value = newVal.toFixed(2);
                    } else { // To Derived
                        newVal = val * factor;
                        input.value = Math.round(newVal); // µmol usually integer
                    }
                }
            } else if (type === 'lipid') {
                // Affects CT, HDL, TG, NonHDL, LDL
                ['ct', 'hdl', 'tg', 'nonhdl', 'ldl'].forEach(lipid => {
                    const input = document.getElementById(`bio-${lipid}`);
                    const label = input.nextElementSibling;

                    // Label Update
                    if (lipid === 'ldl') label.textContent = `LDLc (${nextUnit})`;
                    else if (lipid === 'nonhdl') label.textContent = `Non-HDLc (${nextUnit})`;
                    else label.textContent = `${lipid.toUpperCase()} (${nextUnit})`;

                    if (input.value) {
                        const val = parseFloat(input.value);

                        // User specifically requested generic lipid factor (2.586) for TG as well
                        const factor = UNIT_CONVERSION['lipid'].factors['mmol/L'];

                        // If Next is mmol/L (Derived) -> Multiply
                        // If Next is g/L (Base) -> Divide

                        if (nextUnit === 'mmol/L') {
                            input.value = (val * factor).toFixed(2);
                        } else {
                            input.value = (val / factor).toFixed(2);
                        }
                    }
                });
            } else if (type === 'rac') {
                const input = document.getElementById('bio-rac');
                input.nextElementSibling.textContent = `RAC (${nextUnit})`;

                if (input.value) {
                    const val = parseFloat(input.value);
                    // RAC: Base=mg/g. Derived=mg/mmol.
                    // 1 mg/mmol = 8.84 mg/g.
                    // Factor stored is for mg/mmol -> 8.84? No wait.
                    // 'rac': { base: 'mg/g', factors: { 'mg/mmol': 0.113 } } 
                    // My previous Logic for rac normalize: val(mmol) / 0.113 = val(mg/g). 
                    // So 1 mmol = 8.84 g.  1/0.113 = 8.84.

                    // If Next is mg/mmol (Derived): Base * 0.113.
                    // If Next is mg/g (Base): Derived / 0.113.

                    const factor = UNIT_CONVERSION['rac'].factors['mg/mmol']; // 0.113

                    if (nextUnit === 'mg/mmol') {
                        input.value = Math.round(val * factor).toFixed(0);
                    } else {
                        input.value = Math.round(val / factor).toFixed(0);
                    }
                }
            }

            // Recalculate Derived stats (Score2, DFG)
            updateBiologicalCalculations();
        });
    });
}

async function deleteBiologicalEntry(index) {
    if (!currentPatient || !currentPatient.biologicalHistory) return;

    if (confirm('Supprimer cette entrée ?')) {
        currentPatient.biologicalHistory.splice(index, 1);

        try {
            await window.electronAPI.updatePatient(currentPatient.db_id, {
                biologicalHistory: currentPatient.biologicalHistory
            });
            renderHistoryTable(currentPatient.biologicalHistory);
            renderEvolutionChart(currentPatient.biologicalHistory);
        } catch (err) {
            console.error('Error deleting entry:', err);
            alert('Erreur lors de la suppression');
        }
    }
}
// Expose to global scope for onclick
window.deleteBiologicalEntry = deleteBiologicalEntry;

// Chart Global for destruction (Existing global used)
let currentChartRange = '1y'; // Default range changed to 1 Year

function initChartFilters() {
    const timeBtns = document.querySelectorAll('.chart-time-filter');
    timeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // UI Toggle
            timeBtns.forEach(b => {
                b.classList.remove('bg-white', 'text-blue-600', 'shadow-sm', 'active');
                b.classList.add('text-gray-600');
            });
            e.target.classList.remove('text-gray-600');
            e.target.classList.add('bg-white', 'text-blue-600', 'shadow-sm', 'active');

            // Logic
            currentChartRange = e.target.getAttribute('data-range');
            if (currentPatient && currentPatient.biologicalHistory) {
                renderEvolutionChart(currentPatient.biologicalHistory);
            }
        });
    });
}
// Init filters on load
document.addEventListener('DOMContentLoaded', initChartFilters);

function renderEvolutionChart(history) {
    const ctx = document.getElementById('evolutionChart');
    if (!ctx) return;

    if (biologicalChart) {
        biologicalChart.destroy();
    }

    if (!history || history.length === 0) return;

    // 1. Sort Data
    let sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));

    // 2. Apply Time Filter
    if (currentChartRange === '1y') {
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        sortedHistory = sortedHistory.filter(h => new Date(h.date) >= cutoff);
    }
    // (Add 6m logic if needed, simplifed to 1y/Use All for now)

    const metric = document.getElementById('chart-metric-select').value;
    const labels = sortedHistory.map(h => h.date);

    // 3. Define Metric Configs
    const datasets = [];
    const annotations = {};

    // Helper for Gradient
    const createGradient = (ctx, color) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, color + '50'); // 30% opacity
        gradient.addColorStop(1, color + '00'); // 0%
        return gradient;
    };
    // Context needed for gradient generation, but Chart.js creates it lazily.
    // We'll trust Chart.js context finding or use specific colors for now.
    // Actually, to do gradients properly in config, we need the canvas context.
    const chartCtx = ctx.getContext('2d');

    switch (metric) {
        case 'weight':
            datasets.push({
                label: 'Poids (kg)',
                data: sortedHistory.map(h => h.weight),
                borderColor: '#10b981', // Green
                backgroundColor: createGradient(chartCtx, '#10b981'),
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                spanGaps: true
            });
            // Target Zone Example (BMI < 25 -> approx < 80kg depends on height, skipping complex zone)
            break;

        case 'bp':
            datasets.push({
                label: 'PAS (mmHg)',
                data: sortedHistory.map(h => h.sys),
                borderColor: '#ef4444', // Red
                backgroundColor: createGradient(chartCtx, '#ef4444'),
                tension: 0.4,
                fill: true,
                yAxisID: 'y',
                pointRadius: 3,
                spanGaps: true
            });
            datasets.push({
                label: 'PAD (mmHg)',
                data: sortedHistory.map(h => h.dia),
                borderColor: '#3b82f6', // Blue
                backgroundColor: createGradient(chartCtx, '#3b82f6'),
                tension: 0.4,
                fill: true,
                yAxisID: 'y',
                pointRadius: 3,
                spanGaps: true
            });
            // Target Lines: 140 and 90
            // Since we can't easily use the Annotation Plugin without installing it via npm/CDN,
            // we will simulate targets using a "Line Dataset" with pointRadius: 0
            // OR we trust the user knows 140/90.
            // Let's add a "Limit" dataset for 140
            datasets.push({
                label: 'Seuil PAS (140)',
                data: sortedHistory.map(_ => 140),
                borderColor: '#ef4444',
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                order: 99,
                spanGaps: true
            });
            datasets.push({
                label: 'Seuil PAD (90)',
                data: sortedHistory.map(_ => 90),
                borderColor: '#3b82f6',
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                order: 99,
                spanGaps: true
            });
            break;

        case 'hba1c':
            datasets.push({
                label: 'HbA1c (%)',
                data: sortedHistory.map(h => h.hba1c),
                borderColor: '#3b82f6', // Blue
                backgroundColor: createGradient(chartCtx, '#3b82f6'),
                tension: 0.4,
                fill: true,
                spanGaps: true
            });
            // Target: 7%
            datasets.push({
                label: 'Objectif (7%)',
                data: sortedHistory.map(_ => 7),
                borderColor: '#22c55e', // Green
                borderDash: [6, 4],
                pointRadius: 0,
                borderWidth: 2,
                fill: false,
                spanGaps: true
            });
            break;

        case 'dfg':
            datasets.push({
                label: 'DFG (mL/min)',
                data: sortedHistory.map(h => h.dfg),
                borderColor: '#8b5cf6', // Violet
                backgroundColor: createGradient(chartCtx, '#8b5cf6'),
                tension: 0.4,
                fill: true,
                spanGaps: true
            });
            // Target: 90 (G1/G2 Boundary)
            datasets.push({
                label: 'G1/G2 (>90)',
                data: sortedHistory.map(_ => 90),
                borderColor: '#22c55e', // Green
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                spanGaps: true
            });
            // Target: 60 (G2/G3a Boundary)
            datasets.push({
                label: 'G3a (<60)',
                data: sortedHistory.map(_ => 60),
                borderColor: '#eab308', // Yellow-500
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                spanGaps: true
            });
            // Target: 45 (G3a/G3b Boundary)
            datasets.push({
                label: 'G3b (<45)',
                data: sortedHistory.map(_ => 45),
                borderColor: '#f97316', // Orange-500
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                spanGaps: true
            });
            // Target: 30 (G3b/G4 Boundary)
            datasets.push({
                label: 'G4 (<30)',
                data: sortedHistory.map(_ => 30),
                borderColor: '#dc2626', // Red-600
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                spanGaps: true
            });
            // Target: 15 (G4/G5 Boundary)
            datasets.push({
                label: 'G5 (<15)',
                data: sortedHistory.map(_ => 15),
                borderColor: '#7f1d1d', // Red-900
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                spanGaps: true
            });
            break;

        case 'rac':
            // stored as mg/g (base). KDIGO table uses mg/mmol.
            // 1 mg/g approx 0.113 mg/mmol.
            // conversion: val * 0.113.
            datasets.push({
                label: 'RAC (mg/mmol)',
                data: sortedHistory.map(h => h.rac ? (h.rac * 0.113).toFixed(1) : null), // Convert to mg/mmol
                borderColor: '#f59e0b', // Orange-ish
                backgroundColor: createGradient(chartCtx, '#f59e0b'),
                tension: 0.4,
                fill: true,
                spanGaps: true
            });
            // Target: 3 (A1/A2 Boundary)
            datasets.push({
                label: 'A1/A2 Limit (3)',
                data: sortedHistory.map(_ => 3),
                borderColor: '#22c55e', // Green
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                spanGaps: true
            });
            // Target: 30 (A2/A3 Boundary)
            datasets.push({
                label: 'A2/A3 Limit (30)',
                data: sortedHistory.map(_ => 30),
                borderColor: '#dc2626', // Red
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 1,
                fill: false,
                spanGaps: true
            });
            break;

        case 'lipids':
            // CT, LDL, HDL, TG
            datasets.push({
                label: 'LDLc',
                data: sortedHistory.map(h => h.ldl), // Note: stored as base g/L
                borderColor: '#ef4444', // Red (Bad)
                backgroundColor: createGradient(chartCtx, '#ef4444'),
                tension: 0.3,
                fill: true,
                borderWidth: 2,
                pointRadius: 3,
                spanGaps: true
            });
            datasets.push({
                label: 'HDL',
                data: sortedHistory.map(h => h.hdl),
                borderColor: '#10b981', // Green (Good)
                backgroundColor: createGradient(chartCtx, '#10b981'),
                tension: 0.3,
                fill: true,
                borderWidth: 2,
                pointRadius: 3,
                spanGaps: true
            });
            datasets.push({
                label: 'TG',
                data: sortedHistory.map(h => h.tg),
                borderColor: '#f59e0b', // Orange
                backgroundColor: createGradient(chartCtx, '#f59e0b'),
                tension: 0.3,
                fill: true,
                borderWidth: 2,
                pointRadius: 3,
                spanGaps: true
            });
            datasets.push({
                label: 'CT',
                data: sortedHistory.map(h => h.ct),
                borderColor: '#6b7280', // Gray
                backgroundColor: createGradient(chartCtx, '#6b7280'),
                tension: 0.3,
                fill: true,
                borderWidth: 1,
                borderDash: [2, 2], // Dashed for Total
                pointRadius: 2,
                spanGaps: true
            });
            break;
    }

    biologicalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#1f2937',
                    bodyColor: '#4b5563',
                    borderColor: '#e5e7eb',
                    borderWidth: 1,
                    padding: 10,
                    boxPadding: 4
                },
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'month',
                        displayFormats: {
                            month: 'MMM yyyy' // Short Month + Year
                        },
                        tooltipFormat: 'dd MMM yyyy'
                    },
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: '#f3f4f6'
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
}

function showScore2DModal() {
    const modal = document.getElementById('score2d-modal');
    const body = document.getElementById('score2d-modal-body');

    // Gather inputs to determine WHY
    const age = parseInt(document.getElementById('calc-age').innerText);
    const sbp = parseFloat(document.getElementById('bio-sys').value);
    const cholTotal = parseFloat(document.getElementById('bio-ct').value);
    const cholHdl = parseFloat(document.getElementById('bio-hdl').value);
    const hba1cPerc = parseFloat(document.getElementById('bio-hba1c').value);
    const eGFR = parseFloat(document.getElementById('bio-dfg').value);
    const diagYear = parseInt(document.getElementById('inp-diagnosis-year').value);

    // Check Overrides first
    const isVeryHighRisk = assessVeryHighRisk(eGFR);

    let content = '';

    if (isVeryHighRisk) {
        content += `
            <div class="p-3 bg-red-50 border border-red-200 rounded text-red-700 mb-3">
                <h4 class="font-bold flex items-center gap-2"><i class="fas fa-exclamation-triangle"></i> Risque Très Élevé (Override)</h4>
                <p class="text-xs mt-1">Le patient est classé automatiquement en "Très Haut Risque" car il présente au moins un des critères d'exclusion du SCORE2 (Maladie CV établie ou Atteinte d'organe sévère).</p>
            </div>
            <h5 class="font-semibold text-gray-700 mb-2">Critères détectés :</h5>
            <ul class="list-disc ml-5 text-xs text-gray-600 space-y-1">
        `;

        // Detailed Reasons
        const macroIds = [
            { id: 'macro-coronary', label: 'Coronaropathie' },
            { id: 'macro-aomi', label: 'AOMI' },
            { id: 'macro-stenosis', label: 'Sténose Carotidienne' },
            { id: 'macro-avc', label: 'AVC / AIT' }
        ];
        macroIds.forEach(item => {
            if (document.getElementById(item.id).value === 'OUI') {
                content += `<li><strong>ASCVD</strong> : ${item.label}</li>`;
            }
        });

        if (eGFR < 45) content += `<li><strong>Fonction Rénale</strong> : DFG < 45 ml/min (Stade G3b/G4/G5)</li>`;

        const racInput = document.getElementById('bio-rac').value;
        const racUnit = getActiveUnit('rac');
        let racVal = 0;
        if (racInput) racVal = normalizeValue(parseFloat(racInput), 'rac', racUnit);

        if (eGFR >= 45 && eGFR <= 59 && racVal >= 30 && racVal <= 300) content += `<li><strong>Rein</strong> : DFG 45-59 + Microalbuminurie (A2)</li>`;
        if (racVal > 300) content += `<li><strong>Rein</strong> : Protéinurie sévère (A3)</li>`;

        const microIds = ['micro-retino', 'micro-nephro', 'micro-neuro-sens', 'micro-neuro-auto'];
        const microCount = microIds.filter(id => document.getElementById(id).value === 'OUI').length;
        if (microCount >= 3) content += `<li><strong>Microvasculaire</strong> : >= 3 sites atteints</li>`;

        content += `</ul>`;

    } else if (isNaN(age) || age < 40 || age >= 70) { // Note: calculations.js says >=70 excludes.
        content = `
            <div class="p-3 bg-blue-50 border border-blue-200 rounded text-blue-700">
                <h4 class="font-bold mb-1"><i class="fas fa-info-circle"></i> Non Éligible au Calcul</h4>
                <p>Le modèle SCORE2-Diabetes n'est validé que pour les patients âgés de <strong>40 à 69 ans</strong>.</p>
                <p class="mt-2 text-xs text-gray-500">Âge actuel : ${isNaN(age) ? '--' : age} ans.</p>
            </div>
        `;
    } else {
        // Missing Data Check
        const missing = [];
        if (isNaN(sbp)) missing.push("Pression Artérielle Systolique");
        if (isNaN(cholTotal)) missing.push("Cholestérol Total");
        if (isNaN(cholHdl)) missing.push("HDL Cholestérol");
        if (isNaN(hba1cPerc)) missing.push("HbA1c");
        if (isNaN(eGFR)) missing.push("DFG");
        if (isNaN(diagYear)) missing.push("Année du diagnostic");

        if (missing.length > 0) {
            content = `
                <div class="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700">
                    <h4 class="font-bold mb-1"><i class="fas fa-exclamation-circle"></i> Données Manquantes</h4>
                    <p>Le calcul nécessite les paramètres suivants :</p>
                    <ul class="list-disc ml-5 mt-2 text-xs">
                        ${missing.map(m => `<li>${m}</li>`).join('')}
                    </ul>
                </div>
            `;
        } else {
            // Success Case (Standard Risk)
            const scoreVal = document.getElementById('bio-score2d').value;
            content = `
                <p><strong>Risque calculé :</strong> ${scoreVal}</p>
                <p class="mt-2">Ce patient est éligible au SCORE2-Diabetes.</p>
                <p class="mt-2 text-xs text-gray-500">Le score estime le risque à 10 ans d'événements cardiovasculaires majeurs.</p>
            `;
        }
    }

    body.innerHTML = content;
    modal.classList.remove('hidden');
}

// Initialize
// Initialize
// initBiologicalFollowUp(); // Removed in favor of DOMContentLoaded

function renderHistoryTable(history) {
    const tbody = document.querySelector('#bio-history-table tbody');
    const thead = document.querySelector('#bio-history-table thead');
    if (!tbody || !thead) return;

    // Update Header to include units (Fixed Standard)
    thead.innerHTML = `
        <tr>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Poids<br><span class="text-xs normal-case">(kg)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IMC<br><span class="text-xs normal-case">(kg/m²)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PAS<br><span class="text-xs normal-case">(mmHg)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PAD<br><span class="text-xs normal-case">(mmHg)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Créat<br><span class="text-xs normal-case">(µmol/L)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DFG<br><span class="text-xs normal-case">(ml/min)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RAC<br><span class="text-xs normal-case">(mg/mmol)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CT<br><span class="text-xs normal-case">(g/L)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">TG<br><span class="text-xs normal-case">(g/L)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LDLc<br><span class="text-xs normal-case">(g/L)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HbA1c<br><span class="text-xs normal-case">(%)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SCORE2<br><span class="text-xs normal-case">(%)</span></th>
            <th class="px-4 py-2 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
    `;

    tbody.innerHTML = '';

    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="text-center py-4 text-gray-500">Aucun historique disponible</td></tr>';
        return;
    }

    history.forEach((entry, index) => {
        const row = document.createElement('tr');

        // --- DATA PREPARATION (Fixed Units) ---

        // Creatinine: Stored in Base (µmol/L or mg/L? logic says base is mg/L from conversions?) 
        // Let's re-verify normalizeValue logic in code.
        // creat.toUmol = val * 8.84. implies Base was mg/L?
        // Wait, normalizeValue: 
        // if unit == 'mg/dL' (incorrect unit string in earlier code?) -> convert to base.
        // Let's assume standard behavior:
        // By default, if we store µmol/L as base?
        // Actually, looking at `toUmol: (val) => val * 8.84`, this implies input was mg/L.
        // So BASE IS mg/L.
        // We want Table in µmol/L. So we MUST convert Base(mg/L) * 8.84.

        // RAC:
        // toMgMmol: val / 8.84. Implies Base is mg/g.
        // Table wants mg/mmol. So Base(mg/g) / 8.84.
        // And Round to integer.

        // Lipids:
        // toMmol: val * 2.586. Implies Base is g/L.
        // Table wants g/L. So Display Base directly.

        // NOTE: If my assumption about "Base Unit" is wrong, I might invert conversions.
        // Checking `CONVERSION_FACTORS`:
        // lipid.toMmol = val * 2.586. This converts g/L -> mmol/L. So Base is g/L. Correct.
        // creat.toUmol = val * 8.84. This converts mg/L -> µmol/L. So Base is mg/L. Correct.
        // rac.toMgMmol = val / 8.84. This converts mg/g -> mg/mmol. So Base is mg/g. Correct.

        const dispCreat = entry.creat ? (entry.creat * 8.84).toFixed(0) : '-'; // Base(mg/L) -> µmol/L

        let dispRac = '-';
        if (entry.rac) {
            const racVal = entry.rac / 8.84; // Base(mg/g) -> mg/mmol
            dispRac = Math.round(racVal).toFixed(0); // Round to integer as requested
        }

        const dispLipids = (val) => val ? parseFloat(val).toFixed(2) : '-'; // Base is g/L, matches Table Req.

        // Determine Risk Icon State for this Entry
        // Re-evaluate risk state based on entry data + current persistent risk factors
        const entryDate = new Date(entry.date);
        const birthDate = new Date(currentPatient.birthDate);
        let ageAtEntry = entryDate.getFullYear() - birthDate.getFullYear();
        // Adjust if birth month/day hasn't occurred yet in that year (simple approx ok for now, or precise)
        const m = entryDate.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && entryDate.getDate() < birthDate.getDate())) {
            ageAtEntry--;
        }

        // 1. Check Exclusion (Red !) - ASCVD (Global) or TOD (Entry specific)
        // Check Global ASCVD
        const macroIds = ['macro-coronary', 'macro-aomi', 'macro-stenosis', 'macro-avc'];
        const hasASCVD = macroIds.some(id => document.getElementById(id) && document.getElementById(id).value === 'OUI');

        // Check Entry TOD
        const entryDFG = parseFloat(entry.dfg);
        let isSevereTOD = false;
        if (!isNaN(entryDFG)) {
            if (entryDFG < 45) isSevereTOD = true;
            // We could check RAC/Micro here too if we assume current Micro applies or if we store it.
            // For now, let's use the helper logic if we can, but assessVeryHighRisk reads DOM.
            // Let's replicate inline for entry-specifics + global micro.
            const microIds = ['micro-retino', 'micro-nephro', 'micro-neuro-sens', 'micro-neuro-auto'];
            const microCount = microIds.filter(id => document.getElementById(id) && document.getElementById(id).value === 'OUI').length;

            // Normalize RAC from entry (Base mg/g?)
            let entryRac = 0;
            if (entry.rac) entryRac = entry.rac; // Stored as mg/g base

            if (entryDFG >= 45 && entryDFG <= 59 && entryRac >= 30) isSevereTOD = true; // A2
            if (entryRac > 300) isSevereTOD = true; // A3
            if (microCount >= 3) isSevereTOD = true;
        }

        let iconHtml = '';

        // PRIORITY 1: RED ! (Exclusion / Very High Risk)
        if (hasASCVD || isSevereTOD) {
            iconHtml = `<i class="fas fa-exclamation text-red-600 text-lg" title="Risque Très Élevé (Override)"></i>`;
        }
        // PRIORITY 2: ORANGE ! (Age Inappropriate)
        else if (ageAtEntry < 40 || ageAtEntry >= 70) {
            iconHtml = `<i class="fas fa-exclamation text-orange-500 text-lg" title="Non éligible (Age: ${ageAtEntry} ans)"></i>`;
        }
        // PRIORITY 3: GREY ? (Missing Data)
        // Check entry fields
        else {
            // We need to check if SCORE is calculated. 
            // If calculateScore returns null/empty but no override and age is ok, it's missing data.
            // OR check columns directly.
            const hasMissing = !entry.sys || !entry.ct || !entry.hdl || !entry.dfg || !entry.hba1c; // Basic check
            if (hasMissing) {
                iconHtml = `<i class="fas fa-question text-gray-400 text-lg" title="Données manquantes"></i>`;
            } else {
                // PRIORITY 4: VALID SCORE (Display Value in %)
                // User request: "display the value in %"
                const val = entry.score2d || '-';
                const colorClass = getScoreColorClass(val);
                iconHtml = `<span class="font-bold ${colorClass}">${val}</span>`;
            }
        }

        row.innerHTML = `
            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${new Date(entry.date).toLocaleDateString('fr-FR')}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${entry.weight || '-'}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${entry.bmi || '-'}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${entry.sys || '-'}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${entry.dia || '-'}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${dispCreat}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${entry.dfg || '-'}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${dispRac}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${dispLipids(entry.ct)}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${dispLipids(entry.tg)}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${dispLipids(entry.ldl)}</td>
            <td class="px-4 py-2 text-sm text-gray-700">${entry.hba1c || '-'}</td>
            <td class="px-4 py-2 text-center">${iconHtml}</td>
            <td class="px-4 py-2 text-center whitespace-nowrap">
                <button class="text-blue-500 hover:text-blue-700 mr-2" onclick="editBiologicalEntry(${index})" title="Modifier">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="text-red-500 hover:text-red-700" onclick="deleteBiologicalEntry(${index})" title="Supprimer">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function formatValueWithUnit(val, type) {
    if (val === null || val === undefined) return '-';
    return val;
}

function getScoreColorClass(scoreStr) {
    if (!scoreStr) return '';
    // Check for Overrides first
    if (scoreStr.toString().includes('>') || scoreStr.toString().includes('T.')) {
        return 'text-red-600';
    }
    const score = parseFloat(scoreStr);
    if (isNaN(score)) return '';
    if (score >= 20) return 'text-red-600';
    if (score >= 10) return 'text-orange-500';
    if (score >= 5) return 'text-yellow-600';
    return 'text-green-600';
}

// --- Examens Section Logic ---

function initExamsModule() {
    console.log('Initializing Exams Module');

    // 1. Populate Dropdowns
    const months = [
        { v: '', l: 'Mois' },
        { v: '1', l: 'Jan' }, { v: '2', l: 'Fév' }, { v: '3', l: 'Mar' },
        { v: '4', l: 'Avr' }, { v: '5', l: 'Mai' }, { v: '6', l: 'Juin' },
        { v: '7', l: 'Juil' }, { v: '8', l: 'Août' }, { v: '9', l: 'Sep' },
        { v: '10', l: 'Oct' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Déc' }
    ];

    const currentYear = new Date().getFullYear();
    const years = [{ v: '', l: 'Année' }];
    for (let i = currentYear + 5; i >= currentYear - 10; i--) {
        years.push({ v: i.toString(), l: i.toString() });
    }

    // Populate all month/year selects
    const populateSelect = (selector, options) => {
        const selects = document.querySelectorAll(selector);
        selects.forEach(sel => {
            const currentVal = sel.value; // preserve value if re-running
            sel.innerHTML = options.map(o => `<option value="${o.v}">${o.l}</option>`).join('');
            if (currentVal) sel.value = currentVal;
        });
    };

    populateSelect('.exam-month-select', months);
    populateSelect('.exam-year-select', years);
    populateSelect('#other-exam-month', months);
    populateSelect('#other-exam-year', years);

    // 2. Systematic Exams Auto-Save Listener & Auto-Calc
    const systematicSelects = document.querySelectorAll('.exam-month-select, .exam-year-select');
    systematicSelects.forEach(sel => {
        sel.addEventListener('change', () => {
            // Auto-Calculate Renewal Date if "Last Date" changed
            if (sel.dataset.type === 'last') {
                updateNextDate(sel.dataset.exam);
            }
            saveExamsData(false); // Silent auto-save
            updateExamStatus(sel.dataset.exam); // Update status UI
        });
    });

    // 3. Other Exams UI Logic
    const btnAddOther = document.getElementById('btn-add-other-exam');
    const formContainer = document.getElementById('add-other-exam-form');
    const btnCancel = document.getElementById('btn-cancel-add-exam');
    const btnConfirm = document.getElementById('btn-confirm-add-exam');

    if (btnAddOther && formContainer) {
        btnAddOther.addEventListener('click', () => {
            formContainer.classList.remove('hidden');
            // Reset form
            document.getElementById('other-exam-type').value = '';
            document.getElementById('other-exam-month').value = '';
            document.getElementById('other-exam-year').value = '';
            document.getElementById('other-exam-result').value = '';
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            formContainer.classList.add('hidden');
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            await addOtherExam();
        });
    }
}

// Auto-Calculate Next Date
function updateNextDate(examKey) {
    const lastM = document.querySelector(`.exam-month-select[data-exam="${examKey}"][data-type="last"]`).value;
    const lastY = document.querySelector(`.exam-year-select[data-exam="${examKey}"][data-type="last"]`).value;

    if (!lastM || !lastY) return; // Need both to calculate

    const date = new Date(parseInt(lastY), parseInt(lastM) - 1, 1);

    // Define Intervals (in months)
    let interval = 12; // Default 1 year
    if (examKey === 'hba1c') interval = 3;
    if (examKey === 'eyes') interval = 24; // Bisannuel

    date.setMonth(date.getMonth() + interval);

    // Update Next Selectors
    const nextM = date.getMonth() + 1;
    const nextY = date.getFullYear();

    const nextMEl = document.querySelector(`.exam-month-select[data-exam="${examKey}"][data-type="next"]`);
    const nextYEl = document.querySelector(`.exam-year-select[data-exam="${examKey}"][data-type="next"]`);

    if (nextMEl) nextMEl.value = nextM.toString();
    if (nextYEl) nextYEl.value = nextY.toString();
}

// Helper: Update Status for Systematic Exams
// Helper: Update Status for Systematic Exams
function updateExamStatus(examKey) {
    const nextM = document.querySelector(`.exam-month-select[data-exam="${examKey}"][data-type="next"]`).value;
    const nextY = document.querySelector(`.exam-year-select[data-exam="${examKey}"][data-type="next"]`).value;
    const statusContainer = document.getElementById(`status-${examKey}`);

    if (!statusContainer) return;

    if (!nextM || !nextY) {
        statusContainer.innerHTML = '<span class="text-gray-300">--</span>';
        return;
    }

    const today = new Date();
    // Month-based comparison logic
    const currentMonthIndex = today.getFullYear() * 12 + today.getMonth(); // 0-indexed months
    const renewalMonthIndex = parseInt(nextY) * 12 + (parseInt(nextM) - 1);

    let icon = '';

    if (currentMonthIndex > renewalMonthIndex) {
        // Red: Past the renewal month (Strictly overdue)
        icon = `<i class="fas fa-times text-red-500 text-lg" title="En retard"></i>`;
    } else if (currentMonthIndex === renewalMonthIndex) {
        // Orange: In the renewal month (Due now)
        icon = `<i class="fas fa-exclamation text-orange-500 text-lg" title="À prévoir ce mois-ci"></i>`;
    } else {
        // Green: Before the renewal month (Up to date)
        icon = `<i class="fas fa-check text-green-500 text-lg" title="À jour"></i>`;
    }

    statusContainer.innerHTML = icon;
}

// Save Logic for Exams
const saveExamsData = async (notify = true) => {
    if (!currentPatient) return;

    // 1. Gather Systematic Data
    const systematic = {};
    const exams = ['hba1c', 'lipids', 'rac', 'ecg', 'feet', 'dental', 'eyes'];

    exams.forEach(key => {
        const lastM = document.querySelector(`.exam-month-select[data-exam="${key}"][data-type="last"]`).value;
        const lastY = document.querySelector(`.exam-year-select[data-exam="${key}"][data-type="last"]`).value;
        const nextM = document.querySelector(`.exam-month-select[data-exam="${key}"][data-type="next"]`).value;
        const nextY = document.querySelector(`.exam-year-select[data-exam="${key}"][data-type="next"]`).value;

        systematic[key] = {
            last: { month: lastM, year: lastY },
            next: { month: nextM, year: nextY }
        };
    });

    // 2. Gather Other Exams
    const others = currentPatient.exams?.others || [];

    const examsData = {
        systematic,
        others
    };

    // Update Local Object
    currentPatient.exams = examsData;

    try {
        await window.electronAPI.updatePatient(currentPatient.db_id, { exams: examsData });
        if (notify) showNotification('Données examens enregistrées', 'success');
    } catch (err) {
        console.error('Error saving exams:', err);
        if (notify) showNotification('Erreur sauvegarde examens', 'error');
    }
};

// Add Other Exam Logic
async function addOtherExam() {
    const type = document.getElementById('other-exam-type').value;
    const month = document.getElementById('other-exam-month').value;
    const year = document.getElementById('other-exam-year').value;
    const result = document.getElementById('other-exam-result').value;

    if (!type) {
        alert("Veuillez sélectionner un type d'examen.");
        return;
    }
    if (!year) {
        alert("Veuillez sélectionner l'année.");
        return;
    }

    const newExam = {
        id: Date.now(),
        type,
        date: { month, year },
        result: result || '',
        createdAt: new Date().toISOString()
    };

    if (!currentPatient.exams) currentPatient.exams = { systematic: {}, others: [] };
    if (!currentPatient.exams.others) currentPatient.exams.others = [];

    currentPatient.exams.others.push(newExam);

    // Sort by date desc
    currentPatient.exams.others.sort((a, b) => {
        const ya = parseInt(a.date.year) || 0;
        const yb = parseInt(b.date.year) || 0;
        if (ya !== yb) return yb - ya;
        return (parseInt(b.date.month) || 0) - (parseInt(a.date.month) || 0);
    });

    // Save & Refresh
    await saveExamsData(true);
    renderOtherExamsTable(currentPatient.exams.others);

    // Hide Form
    document.getElementById('add-other-exam-form').classList.add('hidden');
}

// Render Other Exams Table
function renderOtherExamsTable(others) {
    const tbody = document.getElementById('other-exams-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!others || others.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400 italic">Aucun examen manuel enregistré.</td></tr>`;
        return;
    }

    const monthNames = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    others.forEach(exam => {
        const row = document.createElement('tr');
        const dateStr = `${monthNames[parseInt(exam.date.month) || 0] || ''} ${exam.date.year}`;

        row.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-700">${exam.type}</td>
            <td class="px-4 py-3 text-center text-gray-600">${dateStr.trim()}</td>
            <td class="px-4 py-3 text-gray-600 truncate max-w-xs" title="${exam.result}">${exam.result || '-'}</td>
            <td class="px-4 py-3 text-right"></td>
        `;

        const actionTd = row.querySelector('td:last-child');
        const btnDel = document.createElement('button');
        btnDel.className = 'text-red-400 hover:text-red-600 transition-colors px-2';
        btnDel.innerHTML = '<i class="fas fa-trash-alt"></i>';
        btnDel.addEventListener('click', async () => {
            if (confirm('Supprimer cet examen ?')) {
                currentPatient.exams.others = currentPatient.exams.others.filter(e => e.id !== exam.id);
                await saveExamsData(false);
                renderOtherExamsTable(currentPatient.exams.others);
            }
        });
        actionTd.appendChild(btnDel);

        tbody.appendChild(row);
    });
}

// Load Exams Data into UI
function loadExamsData(examsData) {
    if (!examsData) examsData = { systematic: {}, others: [] };

    // 1. Systematic
    const sys = examsData.systematic || {};
    const exams = ['hba1c', 'lipids', 'rac', 'ecg', 'feet', 'dental', 'eyes'];

    exams.forEach(key => {
        const data = sys[key] || { last: {}, next: {} };

        const setVal = (selector, val) => {
            const el = document.querySelector(selector);
            if (el) el.value = val || '';
        };

        setVal(`.exam-month-select[data-exam="${key}"][data-type="last"]`, data.last?.month);
        setVal(`.exam-year-select[data-exam="${key}"][data-type="last"]`, data.last?.year);
        setVal(`.exam-month-select[data-exam="${key}"][data-type="next"]`, data.next?.month);
        setVal(`.exam-year-select[data-exam="${key}"][data-type="next"]`, data.next?.year);

        // Update status UI on load
        updateExamStatus(key);
    });

    // 2. Others
    renderOtherExamsTable(examsData.others || []);
}

// --- TREATMENTS MODULE ---

function initTreatmentsModule() {
    const searchInput = document.getElementById('treatment-search');
    const suggestionsBox = document.getElementById('treatment-suggestions');
    const copyBtn = document.getElementById('btn-copy-prescription');

    // Copy Button Logic
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (!currentPatient || !currentPatient.treatments || currentPatient.treatments.length === 0) {
                showNotification('Aucune prescription �� copier.', 'warning');
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

    initAllergiesModule();
}

// Add Treatment
async function addTreatment(med) {
    if (!currentPatient) {
        showNotification('Veuillez d\'abord cr��er ou ouvrir un patient.', 'error');
        return;
    }

    if (!currentPatient.treatments) currentPatient.treatments = [];

    const newTreatment = {
        id: Date.now().toString(),
        name: `${med.dci} (${med.commercialName})`,
        dosages: med.dosages, // Store available dosages for dropdown
        dosage: med.dosages[0] || '',
        unit: '1 cp',
        frequency: '1x /J',
        class: med.class || ''
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

        // Lookup class if missing (Retroactive fix)
        let medClass = t.class;
        if (!medClass && window.MEDICATIONS_DB) {
            // Try to match name against DB
            const match = window.MEDICATIONS_DB.find(m => t.name.includes(m.commercialName) || t.name.includes(m.dci));
            if (match) medClass = match.class;
        }

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
            <td class="px-4 py-3 text-right flex justify-end gap-2 items-center">
                ${medClass ? `<button class="text-blue-400 hover:text-blue-600 px-1 cursor-help" title="Classe: ${medClass}"><i class="fas fa-info-circle"></i></button>` : ''}
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
    renderAllergiesAndIntolerances();
}

// Integration Glue Removed (Now integrated in openPatientHandler)

// --- EDUCATION MODULE ---

// Inline Data to ensure availability
window.EDUCATION_TOPICS = {
    alimentation: {
        label: "Alimentation Saine",
        icon: "fas fa-utensils", // Make sure to use 'fas'
        color: "text-green-600",
        sessions: ["Composer un repas équilibré", "Gérer les matières grasses", "Glucides et index glycémique", "Alimentation et fêtes", "Lecture des étiquettes"]
    },
    activite: {
        label: "Activité Physique",
        icon: "fas fa-walking",
        color: "text-blue-600",
        sessions: ["Bienfaits de l'activité physique", "Adapter son activité", "Reprise du sport", "Activité au quotidien"]
    },
    autosurveillance: {
        label: "Autosurveillance",
        icon: "fas fa-tint",
        color: "text-red-500",
        sessions: ["Technique de glycémie capillaire", "Interpréter ses résultats", "Quand mesurer sa glycémie ?", "Tenir un carnet de surveillance"]
    },
    traitement: {
        label: "Traitement Médicamenteux",
        icon: "fas fa-pills",
        color: "text-purple-600",
        sessions: ["Comprendre son traitement oral", "Technique d'injection d'insuline", "Adaptation des doses", "Gestion des oublis", "Effets secondaires"]
    },
    resolution: {
        label: "Résolution de Problèmes",
        icon: "fas fa-lightbulb",
        color: "text-yellow-600",
        sessions: ["Gérer une hypoglycémie", "Gérer une hyperglycémie", "Conduite à tenir en cas de maladie", "Voyages et diabète"]
    },
    adaptation: {
        label: "Compétences d'Adaptation",
        icon: "fas fa-smile",
        color: "text-teal-600",
        sessions: ["Vivre avec le diabète", "Parler de sa maladie", "Gestion du stress", "Projets de vie"]
    },
    risques: {
        label: "Réduction des Risques",
        icon: "fas fa-user-shield",
        color: "text-red-700",
        sessions: ["Prendre soin de ses pieds", "Risque cardiovasculaire", "Suivi ophtalmologique", "Santé bucco-dentaire"]
    }
};

function initEducationModule() {
    console.log("Initializing Education Module...");
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
    console.log("Rendering Education Dashboard...");
    const container = document.getElementById('competencies-list');
    if (!container) {
        console.error("Competencies list container not found!");
        return;
    }

    container.innerHTML = '';

    // Ensure education object exists
    const plan = currentPatient?.education?.plan || [];

    if (!window.EDUCATION_TOPICS) {
        container.innerHTML = '<div class="p-4 text-red-500 bg-red-50 rounded">Erreur: Base de données éducative non chargée via window.EDUCATION_TOPICS.</div>';
        console.error("EDUCATION_TOPICS is missing!");
        return;
    }

    const keys = Object.keys(window.EDUCATION_TOPICS);
    console.log(`Found ${keys.length} education topics.`);

    keys.forEach(key => {
        const topic = window.EDUCATION_TOPICS[key];

        // Calculate Status
        const sessions = plan.filter(s => s.topicKey === key);
        const total = sessions.length;
        const completed = sessions.filter(s => s.done).length;

        let status = 'ACQUIS';
        let statusClass = 'bg-green-500 text-white';
        let statusLabel = 'ACQUIS';

        if (total > 0) {
            if (completed === total) {
                status = 'ACQUIS';
                statusClass = 'bg-green-500 text-white';
            } else if (completed === 0) {
                status = 'NON ACQUIS';
                statusClass = 'bg-red-500 text-white';
                statusLabel = 'NON ACQUIS';
            } else {
                status = 'EN COURS';
                statusClass = 'bg-yellow-400 text-white';
            }
        }

        // Render Item
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors';
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
        session: '', // Let dropdown pick first, or empty
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

        // Session Options (Dynamic from ETP Library)
        // Filter sessions that match this topic's label (Category)
        const relevantSessions = allEtpSessions.filter(s => s.category === topic.label);

        let sessionOpts = '';
        if (relevantSessions.length > 0) {
            sessionOpts = relevantSessions.map(s => `<option value="${s.title}" ${s.title === item.session ? 'selected' : ''}>${s.title}</option>`).join('');
            // Add custom option if the current value is not in the list (legacy or manual entry capability?)
            // For now, if current value is not found, maybe prepend it?
            const found = relevantSessions.find(s => s.title === item.session);
            if (item.session && !found) {
                sessionOpts = `<option value="${item.session}" selected>${item.session} (Legacy)</option>` + sessionOpts;
            }
        } else {
            // Fallback if no sessions in DB
            sessionOpts = `<option value="" disabled selected>Aucune séance définie</option>`;
            if (item.session) {
                sessionOpts += `<option value="${item.session}" selected>${item.session}</option>`;
            }
        }

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
                <textarea rows="2" class="w-full bg-white border border-gray-200 rounded text-sm py-1 px-2 focus:ring-2 focus:ring-blue-100 resize-none edu-update-field" 
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
    console.log("Loading Education Data...", data);
    // Fill Diagnostic Fields
    const diag = data?.diagnostic || {};

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            el.value = val || '';
            console.log(`Set ${id} to "${val || ''}"`);
        } else {
            console.error(`Element not found: ${id}`);
        }
    };

    setVal('diag-bio', diag.bio);
    setVal('diag-psycho', diag.psycho);
    setVal('diag-social', diag.social);
    setVal('diag-needs', diag.needs);

    renderEducationDashboard(); // Will use currentPatient.education.plan
}

// --- SYNTHESIS MODULE (Spiderweb) ---

let synthesisChartInstance = null;

function initSynthesisModule() {
    console.log("Initializing Synthesis Module...");
    // Nothing specific to init, happens on render
}

function renderSynthesisChart() {
    console.log("Rendering Synthesis Chart...");
    const canvas = document.getElementById('synthesis-chart');
    if (!canvas) return;

    if (!currentPatient) return;

    // 1. Extract Data
    // 1. Extract Data
    // User Custom Ranges:
    // HbA1c: 5-14 | PAS: 90-180 | LDL: 0.4-2.2 | TG: 0.4-4.0 | IMC: 18-45 | SCORE: 2-20
    const metrics = {
        hba1c: { val: null, date: null, min: 5, max: 14, step: 1, decimals: 1, label: 'HbA1c (%)' },
        pas: { val: null, date: null, min: 90, max: 180, step: 10, decimals: 0, label: 'PAS (mmHg)' },
        ldl: { val: null, date: null, min: 0.4, max: 2.2, step: 0.2, decimals: 2, label: 'LDLc (g/L)' }, // Decimals 2
        tg: { val: null, date: null, min: 0.4, max: 4.0, step: 0.4, decimals: 2, label: 'TG (g/L)' }, // Decimals 2
        imc: { val: null, date: null, min: 18, max: 45, step: 3, decimals: 1, label: 'IMC (kg/m²)' },
        score: { val: null, date: null, min: 2, max: 20, step: 2, decimals: 0, label: 'SCORE2 (%)' }
    };

    // Bio History (HbA1c, LDLc, TG)
    if (currentPatient.biologicalHistory && currentPatient.biologicalHistory.length > 0) {
        const sortedBio = [...currentPatient.biologicalHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Helper to parse French numbers
        const parseFr = (val) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'number') return val;
            const replaced = val.toString().replace(',', '.');
            const parsed = parseFloat(replaced);
            return isNaN(parsed) ? null : parsed;
        };

        // Find latest valid per type
        const findVal = (key) => sortedBio.find(r => parseFr(r[key]) !== null);

        const hba1cRow = findVal('hba1c');
        if (hba1cRow) { metrics.hba1c.val = parseFr(hba1cRow.hba1c); metrics.hba1c.date = hba1cRow.date; }

        const ldlRow = findVal('ldl');
        if (ldlRow) { metrics.ldl.val = parseFr(ldlRow.ldl); metrics.ldl.date = ldlRow.date; }

        const tgRow = findVal('tg');
        if (tgRow) { metrics.tg.val = parseFr(tgRow.tg); metrics.tg.date = tgRow.date; }
        // Scope extended to include PAS/IMC/SCORE logic below

        // PAS (from 'sys' in Bio History)
        const pasRow = findVal('sys');
        if (pasRow) { metrics.pas.val = parseFr(pasRow.sys); metrics.pas.date = pasRow.date; }

        // IMC: Prioritize stored BMI, else calculate
        const bmiRow = findVal('bmi');
        if (bmiRow) {
            metrics.imc.val = parseFr(bmiRow.bmi);
            metrics.imc.date = bmiRow.date;
        } else {
            // Fallback: Calculate from latest Weight & Height
            const weightRow = findVal('weight');
            const heightRow = findVal('height');
            let weight = weightRow ? parseFr(weightRow.weight) : null;
            let height = heightRow ? parseFr(heightRow.height) : null;
            if (height && height > 3) height = height / 100;

            if (weight && height) {
                const hM = height > 2.5 ? height / 100 : height;
                metrics.imc.val = parseFloat((weight / (hM * hM)).toFixed(1));
                metrics.imc.date = weightRow.date;
            }
        }

        // SCORE2: Prioritize stored 'score2d', else calculate
        const scoreRow = findVal('score2d');
        if (scoreRow) {
            metrics.score.val = parseFr(scoreRow.score2d);
            metrics.score.date = scoreRow.date;
        } else if (typeof calculateScore2Diabetes === 'function') {
            // Fallback Calculation
            try {
                const smoker = currentPatient.risks?.tobacco === 'active';
                const ctRow = findVal('ct');
                const hdlRow = findVal('hdl');

                if (metrics.pas.val && metrics.hba1c.val && ctRow && hdlRow) {
                    const inputs = {
                        age: typeof calculateAge === 'function' ? calculateAge(currentPatient.birthDate) : 60,
                        gender: currentPatient.gender === 'M' ? 'male' : 'female',
                        isSmoker: smoker,
                        sbp: metrics.pas.val,
                        cholTotal: parseFr(ctRow.ct),
                        cholHdl: parseFr(hdlRow.hdl),
                        hba1cPerc: metrics.hba1c.val,
                        eGFR: 90,
                        ageDiagnosis: parseInt(currentPatient.diagnosisYear) || 50
                    };
                    const dfgRow = findVal('dfg');
                    if (dfgRow) inputs.eGFR = parseFr(dfgRow.dfg);

                    const score = calculateScore2Diabetes(inputs);
                    if (score !== null) {
                        metrics.score.val = score;
                        metrics.score.date = new Date().getFullYear();
                    }
                }
            } catch (e) { console.error("Score calc error", e); }
        }
    }


    // 2. Prepare Data for Chart
    const labels = [];
    const dataPoints = [];
    const pointLabels = []; // To store real values for tooltip
    const bgColors = [];

    const keys = ['hba1c', 'pas', 'ldl', 'tg', 'imc', 'score'];

    keys.forEach(key => {
        const m = metrics[key];
        labels.push(m.label);

        if (m.val === null) {
            dataPoints.push(0);
            pointLabels.push("N/A");
            bgColors.push('rgba(200, 200, 200, 0.5)');
        } else {
            let val = m.val;
            let norm = 0;
            // Normalize: Scale 0-100.
            // 0 = Center (Values < Min)
            // 10 = Min Graduation (First Ring)
            // 100 = Max Graduation (Outer Ring)
            // Range [Min, Max] maps to [10, 100]. Width = 90.
            if (val < m.min) {
                // "All values less than inferior... dot at center"
                norm = 0;
            } else if (val > m.max) {
                // "All values more than superior... dot at superior"
                norm = 100;
            } else {
                let fraction = (val - m.min) / (m.max - m.min);
                norm = 10 + (fraction * 90);
            }

            dataPoints.push(norm);

            let displayVal = val;
            if (typeof val === 'number') displayVal = parseFloat(val).toFixed(m.decimals || 0);

            // Warning Logic (Simplistic check)
            let warning = '';
            // if (val > m.max) warning = '!'; // Optional visual cue

            pointLabels.push({ val: displayVal, unit: m.label.split('(')[1]?.replace(')', '') || '', warning });

            bgColors.push('rgba(54, 162, 235, 1)');
        }
    });

    // 3. Render Chart
    // Robust cleanup to prevent "Canvas is already in use"
    if (typeof Chart.getChart === 'function') {
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
    } else if (synthesisChartInstance) {
        synthesisChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Axis Colors (Spectrum Theme: Red -> Purple)
    const axisColors = [
        '#EF4444', // HbA1c (Red)
        '#F97316', // PAS (Orange)
        '#EAB308', // LDL (Yellow)
        '#22C55E', // TG (Green)
        '#06B6D4', // IMC (Cyan)
        '#8B5CF6'  // SCORE (Purple)
    ];

    // Radial Gradient (Depth Effect) handled in backgroundColor scriptable
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;


    // --- NEW: Calculate "Normal Blob" Data ---
    const parseTarget = (str) => {
        if (!str) return null;
        const match = str.match(/([0-9.,]+)/);
        return match ? parseFloat(match[1].replace(',', '.')) : null;
    };

    const targets = currentPatient.targets || {};

    // Default Targets (First option from dropdowns)
    const rawTargets = {
        hba1c: parseTarget(targets.hba1c || '< 7 %') || 7,
        pas: parseTarget(targets.ta || '< 130/80 mmHg') || 130,
        ldl: parseTarget(targets.ldl || '< 0.55 g/L') || 0.55,
        tg: 1.5,  // Fixed
        imc: 25,  // Fixed
        score: 5  // Fixed
    };

    const normalDataPoints = [];
    // Order: HbA1c, PAS, LDL, TG, IMC, SCORE
    const targetKeys = ['hba1c', 'pas', 'ldl', 'tg', 'imc', 'score'];

    targetKeys.forEach(key => {
        const tVal = rawTargets[key];
        const m = metrics[key]; // Access min/max from metrics object

        // Normalize (Same Logic: Min->10, Max->100)
        let norm = 0;
        if (tVal < m.min) norm = 0;
        else if (tVal > m.max) norm = 100;
        else {
            let fraction = (tVal - m.min) / (m.max - m.min);
            norm = 10 + (fraction * 90);
        }
        normalDataPoints.push(norm);
    });

    const customAxisLabels = {
        id: 'customAxisLabels',
        beforeDatasetsDraw: (chart) => {
            const { ctx, scales: { r } } = chart;
            if (!r) return;

            const centerX = r.xCenter;
            const centerY = r.yCenter;
            const radius = r.drawingArea;
            const angleCount = 6;
            const sectorAngle = (Math.PI * 2) / angleCount;
            const startAngle = -Math.PI / 2; // Top -90deg

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 10px Inter';

            const keys = ['hba1c', 'pas', 'ldl', 'tg', 'imc', 'score'];

            keys.forEach((key, i) => {
                const angle = startAngle + (i * sectorAngle);
                const m = metrics[key];

                // Draw 10 graduations. Range is Min to Max.
                // We assume linear steps. 
                // Index 0 = Min (Center). Index 9 = Max (Edge).
                // User wants 10 "graduations". Usually means 10 ticks.
                // If we skip center (0), we draw 1..9.

                // Draw 10 graduations. Range [Min...Max]
                // Min is at 10% radius. Max is at 100% radius.
                // 10 graduations -> 10, 20, 30 ... 100% radius.
                // Value[k] = Min + k*Step. k goes from 0 (Min) to 9 (Max).

                for (let k = 0; k < 10; k++) {
                    // Position: 10% to 100% (0.1 increments)
                    const posFraction = 0.1 + (k * 0.1);

                    // Value
                    const val = m.min + (k * ((m.max - m.min) / 9));

                    const dist = radius * posFraction;
                    const x = centerX + Math.cos(angle) * dist;
                    const y = centerY + Math.sin(angle) * dist;

                    const text = val.toFixed(m.decimals).replace('.', ',');

                    // Background for legibility
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.lineWidth = 3;
                    ctx.strokeText(text, x, y);
                    ctx.fillStyle = '#6b7280'; // Gray 500
                    ctx.fillText(text, x, y);
                    ctx.restore();
                }
            });
        }
    };

    synthesisChartInstance = new Chart(ctx, {
        type: 'radar',
        plugins: [customAxisLabels],
        data: {
            labels: labels,
            datasets: [
                // Dataset 1: Zone de Normalité (Background/Foreground?)
                {
                    label: 'Zone de Normalité',
                    data: normalDataPoints,
                    fill: false,
                    backgroundColor: 'transparent',
                    borderColor: '#9ca3af',
                    borderWidth: 4,
                    tension: 0.4,
                    spanGaps: true,
                    pointRadius: 0,
                    pointHoverRadius: 0
                },
                // Dataset 2: Patient Data
                {
                    label: 'Dernières Données',
                    data: dataPoints,
                    fill: true,
                    backgroundColor: function (context) {
                        const chart = context.chart;
                        const { ctx, width, height, chartArea } = chart;

                        // Fix: Ensure chartArea and dimensions are valid > 0
                        if (!chartArea || width <= 0 || height <= 0) {
                            return null;
                        }

                        // Create dynamic pattern based on chart size
                        // We caching? Chart.js calls this often.
                        // For performance, we could cache if size hasn't changed, but let's try direct first.

                        const cx = width / 2;
                        const cy = height / 2;

                        // 1. Offscreen Pattern
                        // We reuse a shared canvas if possible or create new.
                        // To avoid GC thrashing, best to have a persistent one, but for now purely logic:
                        const pCanvas = document.createElement('canvas');
                        pCanvas.width = width;
                        pCanvas.height = height;
                        const pCtx = pCanvas.getContext('2d');

                        // 2. Conic Gradient (Hues)
                        // Align with first axis (Top Center = -90deg)
                        const conic = pCtx.createConicGradient(-Math.PI / 2, cx, cy);

                        // Spectrum Theme (Red -> Orange -> Yellow -> Green -> Blue -> Purple)
                        // Mapped to axes: HbA1c, PAS, LDL, TG, IMC, SCORE
                        const axisColors = [
                            '#EF4444', // HbA1c (Red)
                            '#F97316', // PAS (Orange)
                            '#EAB308', // LDL (Yellow)
                            '#22C55E', // TG (Green)
                            '#06B6D4', // IMC (Cyan/Blue)
                            '#8B5CF6'  // SCORE (Purple)
                        ];

                        axisColors.forEach((c, i) => conic.addColorStop(i / 6, c));
                        conic.addColorStop(1, axisColors[0]);

                        pCtx.fillStyle = conic;
                        pCtx.fillRect(0, 0, width, height);

                        // 3. Radial Mask (White Fog -> Clear Color)
                        // Center: Solid White (for clean text bg)
                        // Mid: Fading White (Pastel look)
                        // Edge: Transparent (Vibrant Color)

                        const r = Math.min(cx, cy);
                        const mask = pCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
                        mask.addColorStop(0, 'rgba(255, 255, 255, 1)');      // Center: Pure White
                        mask.addColorStop(0.1, 'rgba(255, 255, 255, 0.9)');  // Keep center bright
                        mask.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');  // Pastel blend zone
                        mask.addColorStop(1, 'rgba(255, 255, 255, 0)');     // Edge: Pure Color

                        pCtx.globalCompositeOperation = 'source-over'; // Draw ON TOP of Conic
                        pCtx.fillStyle = mask;
                        pCtx.fillRect(0, 0, width, height);

                        // 4. Transparency Pass (See-through)
                        // We need the entire pattern to be semi-transparent to see grid lines behind it.
                        // Copy pCanvas to itself with globalAlpha?
                        // Or create a final canvas.
                        const finalCanvas = document.createElement('canvas');
                        finalCanvas.width = width;
                        finalCanvas.height = height;
                        const fCtx = finalCanvas.getContext('2d');

                        fCtx.globalAlpha = 0.7; // Make the whole blob see-through
                        fCtx.drawImage(pCanvas, 0, 0);

                        return ctx.createPattern(finalCanvas, 'no-repeat');
                    },
                    borderColor: 'transparent',
                    borderWidth: 0,
                    tension: 0.4, // Organic Curves
                    // Point Styles: Use Axis Color if no Warning, else Red
                    pointBackgroundColor: bgColors.map((c, i) => c.includes('255') ? c : '#fff'),
                    pointBorderColor: bgColors.map((c, i) => c.includes('255') ? '#fff' : axisColors[i]),
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(54, 162, 235)'
                }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    grid: {
                        circular: true,
                        color: 'rgba(0, 0, 0, 0.2)', // Darker grid for visibility
                        borderDash: [5, 5]
                    },
                    ticks: {
                        display: false,
                        backdropColor: 'transparent'
                    },
                    pointLabels: {
                        font: { family: "'Inter', sans-serif", size: 14, weight: '700' },
                        color: axisColors, // Apply distinct color to each label
                        padding: 20
                    },
                    angleLines: {
                        display: true,
                        color: (ctx) => {
                            // Match Axis Color with low opacity (0.2)
                            const hex = axisColors[ctx.index % axisColors.length];
                            // Simple Hex to RGBA conversion
                            // Assuming hex is #RRGGBB format which it is
                            const r = parseInt(hex.slice(1, 3), 16);
                            const g = parseInt(hex.slice(3, 5), 16);
                            const b = parseInt(hex.slice(5, 7), 16);
                            return `rgba(${r}, ${g}, ${b}, 0.2)`;
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#111827',
                    bodyColor: '#4B5563',
                    borderColor: '#E5E7EB',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            const idx = context.dataIndex;
                            const raw = pointLabels[idx]; // { val, unit, warning } or "N/A"
                            if (raw === "N/A") return "Donnée manquante";

                            let str = `Valeur : ${raw.val} ${raw.unit || ''}`;
                            if (raw.warning) str += ` (${raw.warning})`;
                            return str;
                        }
                    }
                }
            }
        }
    });

    renderObjectivesModule();
}

function renderObjectivesModule() {
    console.log("Rendering Objectives Module...");
    const tbody = document.getElementById('objectives-table-body');
    if (!tbody) {
        console.error("Objectives table body not found!");
        return;
    }
    // FIX: Clear existing rows to prevent infinite duplicate expansion
    tbody.innerHTML = '';

    if (!currentPatient) return;

    // Data Source: biologicalHistory
    const hist = [...(currentPatient.biologicalHistory || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Helper: Find Current & Previous
    const getTrendData = (key) => {
        const validRows = hist.filter(r => r[key] !== null && r[key] !== undefined && r[key] !== '');

        const parse = (val) => {
            if (typeof val === 'number') return val;
            return parseFloat(val.toString().replace(',', '.'));
        };

        const current = validRows[0] ? parse(validRows[0][key]) : null;
        const previous = validRows[1] ? parse(validRows[1][key]) : null;
        return { current, previous };
    };

    // Helper: Determine Trend Icon
    const getTrendIcon = (curr, prev) => {
        if (curr === null || prev === null) return '<div class="w-6 h-6 rounded bg-gray-200 flex items-center justify-center mx-auto"><span class="text-gray-500 font-bold text-xs">•</span></div>';
        const diff = curr - prev;
        const threshold = 0.01;

        // Stable (Blue =)
        if (Math.abs(diff) < threshold) {
            return `
                <div class="w-6 h-6 rounded bg-blue-500 flex items-center justify-center shadow-sm mx-auto">
                    <i class="fas fa-equals text-white text-xs"></i>
                </div>`;
        }

        // Up (Red Arrow)
        if (diff > 0) {
            return `
                <div class="w-6 h-6 rounded bg-red-500 flex items-center justify-center shadow-sm mx-auto">
                    <i class="fas fa-arrow-trend-up text-white text-xs"></i>
                </div>`;
        }

        // Down (Green Arrow)
        return `
            <div class="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center shadow-sm mx-auto">
                <i class="fas fa-arrow-trend-down text-white text-xs"></i>
            </div>`;
    };

    // Helper: Evaluate Status
    const evaluateStatus = (val, targetStr) => {
        if (val === null || !targetStr) return '<span class="text-gray-300">--</span>';

        const match = targetStr.match(/([0-9.,]+)/);
        if (!match) return '<span class="text-gray-300">--</span>';

        const targetNum = parseFloat(match[1].replace(',', '.'));
        if (isNaN(targetNum)) return '<span class="text-gray-300">--</span>';

        const isCompliant = val <= targetNum;

        if (isCompliant) {
            return `
                <div class="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-md mx-auto" title="Objectif atteint">
                    <i class="fas fa-check text-white text-xs"></i>
                </div>`;
        }
        return `
            <div class="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow-md mx-auto" title="Objectif non atteint">
                <i class="fas fa-times text-white text-xs"></i>
            </div>`;
    };

    // Define Rows
    const rows = [
        {
            id: 'hba1c',
            label: 'HbA1c',
            icon: '🩸',
            unit: '%',
            options: ['< 7 %', '< 6.5 %', '< 8 %', '< 9 %'],
            infoId: 'modal-info-hba1c',
            dataKey: 'hba1c'
        },
        {
            id: 'ta',
            label: 'TA (PAS)',
            icon: '💓',
            unit: 'mmHg',
            options: ['< 130/80 mmHg', '< 140/90 mmHg', '< 150/90 mmHg'],
            infoId: 'modal-info-ta',
            dataKey: 'sys'
        },
        {
            id: 'ldl',
            label: 'LDL-c',
            icon: '📊',
            unit: 'g/L',
            options: ['< 0.55 g/L', '< 0.70 g/L', '< 1.0 g/L', '< 1.6 g/L'],
            infoId: 'modal-info-ldl',
            dataKey: 'ldl'
        }
    ];

    if (!currentPatient.targets) currentPatient.targets = {};

    rows.forEach(r => {
        const tr = document.createElement('tr');

        const { current, previous } = getTrendData(r.dataKey);
        const trendHtml = getTrendIcon(current, previous);
        const savedTarget = currentPatient.targets[r.id] || r.options[0];
        const statusHtml = evaluateStatus(current, savedTarget);

        tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-700 flex items-center gap-2">
                <span class="text-lg">${r.icon}</span> ${r.label}
                <button class="text-blue-400 hover:text-blue-600 info-btn focus:outline-none" data-modal="${r.infoId}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </button>
            </td>
            <td class="px-4 py-3">
                <select class="bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm focus:border-blue-500 target-select cursor-pointer shadow-sm" data-metric="${r.id}">
                    ${r.options.map(o => `<option value="${o}" ${o === savedTarget ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
            </td>
            <td class="px-4 py-3 text-center font-bold text-gray-800">
                ${current !== null ? current + ' ' + (r.id === 'ta' ? '' : r.unit) : '<span class="text-gray-300">--</span>'}
            </td>
            <td class="px-4 py-3 text-center text-gray-500">
                ${previous !== null ? previous : '<span class="text-gray-300">--</span>'}
            </td>
            <td class="px-4 py-3 text-center">${trendHtml}</td>
            <td class="px-4 py-3 text-center">${statusHtml}</td>
        `;

        tbody.appendChild(tr);
    });

    // Event Listeners for Selects
    const selects = tbody.querySelectorAll('.target-select');
    // ... (Select logic is below) ...

    // Event Listeners for Info Buttons
    const infoBtns = tbody.querySelectorAll('.info-btn');
    infoBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = btn.getAttribute('data-modal');
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('hidden');
            } else {
                console.error('Modal not found:', modalId);
            }
        });
    });

    // Event Listeners
    selects.forEach(sel => {
        sel.addEventListener('change', (e) => {
            try {
                const metricId = e.target.getAttribute('data-metric');
                const newVal = e.target.value;
                console.log(`[Objectives] Target changed for ${metricId}:`, newVal);

                if (!currentPatient.targets) currentPatient.targets = {};
                currentPatient.targets[metricId] = newVal;

                savePatients();

                // Render Table first (rebuilds DOM)
                renderObjectivesModule();

                // Then Render Chart
                console.log("[Objectives] Triggering Chart Redraw...");
                setTimeout(() => {
                    renderSynthesisChart();
                }, 50); // Small delay to ensure DOM settle/stack clear
            } catch (err) {
                console.error("[Objectives] Error handling change:", err);
            }
        });
    });



    // Re-attach close listeners just in case
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = btn.closest('.fixed');
            if (modal) modal.classList.add('hidden');
        });
    });
}

// --- ETP LIBRARY LOGIC (Back-office) ---
let allEtpSessions = [];
let etpSortField = 'id'; // Default sort by DB ID (creation order approx)
let etpSortDirection = 'asc';
let etpSearchQuery = '';

// Helper to find style from label
function getEtpCategoryStyle(label) {
    if (!window.EDUCATION_TOPICS) return { icon: 'fas fa-book', color: 'text-gray-600', bg: 'bg-gray-100' };

    for (const key in window.EDUCATION_TOPICS) {
        const topic = window.EDUCATION_TOPICS[key];
        if (topic.label === label) {
            // Extract color base (e.g. text-green-600 -> green)
            // This is a bit hacky, but sufficient for now. Better to store standardized palettes.
            // Using a simple mapping for bg based on text color class common in the app
            let bgClass = 'bg-gray-100';
            if (topic.color.includes('green')) bgClass = 'bg-green-50';
            else if (topic.color.includes('blue')) bgClass = 'bg-blue-50';
            else if (topic.color.includes('red')) bgClass = 'bg-red-50';
            else if (topic.color.includes('purple')) bgClass = 'bg-purple-50';
            else if (topic.color.includes('yellow')) bgClass = 'bg-yellow-50';
            else if (topic.color.includes('teal')) bgClass = 'bg-teal-50';

            return { icon: topic.icon, color: topic.color, bg: bgClass };
        }
    }
    return { icon: 'fas fa-book', color: 'text-gray-600', bg: 'bg-gray-100' };
}


async function initEtpLibrary() {
    console.log("Initializing ETP Library...");
    await loadEtpLibrary();

    // Event Listeners for Sorting
    ['id', 'title', 'category', 'mode'].forEach(field => {
        const header = document.getElementById(`sort-etp-${field}`);
        if (header) {
            header.addEventListener('click', () => toggleEtpSort(field));
        }
    });

    // Event Listener for Search
    const searchInput = document.getElementById('inp-etp-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            etpSearchQuery = e.target.value.toLowerCase();
            renderEtpLibraryTable();
        });
    }

    document.getElementById('btn-new-etp-session').addEventListener('click', () => {
        openEtpModal();
    });

    document.getElementById('close-modal-etp').addEventListener('click', () => {
        document.getElementById('modal-etp-session').classList.add('hidden');
    });

    document.getElementById('btn-cancel-etp').addEventListener('click', () => {
        document.getElementById('modal-etp-session').classList.add('hidden');
    });

    document.getElementById('form-etp-session').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveEtpSession();
    });
}

function toggleEtpSort(field) {
    if (etpSortField === field) {
        etpSortDirection = etpSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        etpSortField = field;
        etpSortDirection = 'asc';
    }
    renderEtpLibraryTable();
}

async function loadEtpLibrary() {
    try {
        allEtpSessions = await window.electronAPI.getEtpSessions();
        renderEtpLibraryTable();
    } catch (err) {
        console.error("Error loading ETP sessions:", err);
        showNotification("Erreur chargement bibliothèque ETP", "error");
    }
}

function renderEtpLibraryTable() {
    const tbody = document.getElementById('table-etp-library');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Filter
    let filtered = allEtpSessions.filter(s => {
        const q = etpSearchQuery;
        if (!q) return true;
        return (s.title?.toLowerCase().includes(q) ||
            s.category?.toLowerCase().includes(q) ||
            s.custom_id?.toLowerCase().includes(q) ||
            s.content?.toLowerCase().includes(q));
    });

    // Sort
    filtered.sort((a, b) => {
        let valA = a[etpSortField === 'id' ? 'custom_id' : etpSortField] || '';
        let valB = b[etpSortField === 'id' ? 'custom_id' : etpSortField] || '';

        // Handle numeric custom_id sorting if possible
        if (etpSortField === 'id') {
            const numA = parseInt(valA);
            const numB = parseInt(valB);
            if (!isNaN(numA) && !isNaN(numB)) {
                valA = numA;
                valB = numB;
            }
        }

        if (valA < valB) return etpSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return etpSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // Update Header Icons
    ['id', 'title', 'category', 'mode'].forEach(field => {
        const iconInfo = document.querySelector(`#sort-etp-${field} i`);
        if (iconInfo) {
            iconInfo.className = 'fas fa-sort ml-1 text-gray-400'; // Reset
            if (etpSortField === field) {
                iconInfo.className = `fas fa-sort-${etpSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-blue-600`;
            }
        }
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400 italic">Aucune séance trouvée.</td></tr>';
        return;
    }

    filtered.forEach(session => {
        const style = getEtpCategoryStyle(session.category);

        // Dense Layout: py-2, text-xs/sm, truncate
        // Dense Layout: py-2, text-xs/sm, truncate
        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 group";
        row.innerHTML = `
            <td class="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap w-16">${session.custom_id || '-'}</td>
            <td class="px-4 py-3 whitespace-nowrap w-48">
                <span class="inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.color}">
                    <i class="${style.icon}"></i> ${session.category}
                </span>
            </td>
            <td class="px-4 py-3 font-medium text-gray-900 text-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[400px]" title="${session.title}">${session.title}</td>
             <td class="px-4 py-3 text-gray-600 text-xs whitespace-nowrap w-24">${session.mode || '-'}</td>
            <td class="px-4 py-3 text-right space-x-1 whitespace-nowrap w-24">
                <button class="text-gray-400 hover:text-blue-600 transition-colors p-1" onclick="viewEtpSession(${session.id})" title="Voir détails">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="text-blue-600 hover:text-blue-800 transition-colors p-1" onclick="editEtpSession(${session.id})" title="Modifier">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-red-400 hover:text-red-600 transition-colors p-1" onclick="deleteEtpSessionRef(${session.id})" title="Supprimer">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.editEtpSession = (id) => {
    const session = allEtpSessions.find(s => s.id === id);
    if (session) openEtpModal(session, false);
};

window.viewEtpSession = (id) => {
    const session = allEtpSessions.find(s => s.id === id);
    if (session) openEtpModal(session, true);
};

function openEtpModal(session = null, readOnly = false) {
    const modal = document.getElementById('modal-etp-session');
    const title = document.getElementById('modal-etp-title');
    const form = document.getElementById('form-etp-session');
    const actions = document.getElementById('etp-modal-actions');

    form.reset();
    document.getElementById('inp-etp-id').value = '';

    // Inputs array for easy toggling
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(inp => inp.disabled = readOnly);

    if (readOnly) {
        title.textContent = "Détails de la Séance";
        if (actions) actions.classList.add('hidden');
    } else {
        if (actions) actions.classList.remove('hidden');
    }

    if (session) {
        if (!readOnly) title.textContent = "Modifier la Séance";
        document.getElementById('inp-etp-id').value = session.id;
        document.getElementById('inp-etp-custom-id').value = session.custom_id || '';
        document.getElementById('inp-etp-title').value = session.title;
        document.getElementById('inp-etp-category').value = session.category;
        document.getElementById('inp-etp-mode').value = session.mode || 'Individuel';
        document.getElementById('inp-etp-objectives').value = session.educational_objectives || '';
        document.getElementById('inp-etp-prerequisites').value = session.prerequisites || '';
        document.getElementById('inp-etp-content').value = session.content || '';
        document.getElementById('inp-etp-supports').value = session.supports || '';
    } else {
        title.textContent = "Nouvelle Séance";
        if (actions) actions.classList.remove('hidden'); // Ensure visible for new
        // Auto-generate ID: Find max numeric ID + 1
        let maxId = 0;
        allEtpSessions.forEach(s => {
            const num = parseInt(s.custom_id);
            if (!isNaN(num) && num > maxId) maxId = num;
        });
        document.getElementById('inp-etp-custom-id').value = (maxId + 1).toString();
    }

    modal.classList.remove('hidden');
}

window.editEtpSession = (id) => {
    const session = allEtpSessions.find(s => s.id === id);
    if (session) openEtpModal(session);
};

window.deleteEtpSessionRef = async (id) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette séance du référentiel ?")) {
        try {
            await window.electronAPI.deleteEtpSession(id);
            showNotification("Séance supprimée", "success");
            await loadEtpLibrary();
        } catch (err) {
            console.error(err);
            showNotification("Erreur suppression", "error");
        }
    }
};



async function saveEtpSession() {
    const id = document.getElementById('inp-etp-id').value;
    const data = {
        custom_id: document.getElementById('inp-etp-custom-id').value,
        title: document.getElementById('inp-etp-title').value,
        category: document.getElementById('inp-etp-category').value,
        mode: document.getElementById('inp-etp-mode').value,
        educational_objectives: document.getElementById('inp-etp-objectives').value,
        prerequisites: document.getElementById('inp-etp-prerequisites').value,
        content: document.getElementById('inp-etp-content').value,
        supports: document.getElementById('inp-etp-supports').value
    };

    try {
        if (id) {
            await window.electronAPI.updateEtpSession(id, data);
            showNotification("Séance mise à jour", "success");
        } else {
            await window.electronAPI.createEtpSession(data);
            showNotification("Séance créée", "success");
        }
        document.getElementById('modal-etp-session').classList.add('hidden');
        await loadEtpLibrary();
    } catch (err) {
        console.error(err);
        // Display nice error if it's a conflict
        if (err.message && err.message.includes('déjà utilisé')) {
            showNotification(err.message, "error");
        } else {
            showNotification("Erreur de sauvegarde: " + err.message, "error");
        }
    }

}

// Call init when view is loaded? Or on startup?
// Let's add it to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    initEtpLibrary();
    initEducationModule(); // Ensure Education Dashboard renders empty/placeholder if no patient open, or sets up listeners
});

// --- ALLERGIES & INTOLERANCES MODULE ---

function initAllergiesModule() {
    const searchInput = document.getElementById('allergy-search');
    const suggestionsBox = document.getElementById('allergy-suggestions');

    // Search Logic
    if (searchInput && suggestionsBox) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();

            if (query.length < 2) {
                suggestionsBox.classList.add('hidden');
                suggestionsBox.innerHTML = '';
                return;
            }

            // Filter medications (Reuse MEDICATIONS_DB)
            const matches = window.MEDICATIONS_DB ? window.MEDICATIONS_DB.filter(m =>
                m.dci.toLowerCase().includes(query) ||
                m.commercialName.toLowerCase().includes(query)
            ).slice(0, 20) : [];

            if (matches.length === 0) {
                suggestionsBox.classList.add('hidden');
                return;
            }

            // Render suggestions
            const html = matches.map((m, index) => {
                const displayName = `${m.commercialName} (${m.dci})`;
                // Escape quotes for safety
                const safeName = displayName.replace(/'/g, "&#39;");
                return `
                <div class="px-4 py-2 hover:bg-gray-50 flex justify-between items-center border-b border-gray-50 last:border-0 group">
                    <div class="text-sm font-medium text-gray-700">${m.commercialName} <span class="text-xs font-normal text-gray-500">(${m.dci})</span></div>
                    <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-colors" 
                                title="Ajouter aux Allergies" onclick="addAllergy('${safeName}', 'allergy')">
                            <i class="fas fa-exclamation-circle"></i>
                        </button>
                        <button class="w-8 h-8 rounded-full bg-orange-100 text-orange-600 hover:bg-orange-200 flex items-center justify-center transition-colors" 
                                title="Ajouter aux Intolérances" onclick="addAllergy('${safeName}', 'intolerance')">
                            <i class="fas fa-file-medical-alt"></i>
                        </button>
                    </div>
                </div>
            `}).join('');

            suggestionsBox.innerHTML = html;
            suggestionsBox.classList.remove('hidden');
        });

        // Hide on click outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                suggestionsBox.classList.add('hidden');
            }
        });
    }
}

// Add Item
window.addAllergy = async (name, type) => {
    if (!currentPatient) return;

    // init arrays if missing
    if (!currentPatient.allergies) currentPatient.allergies = [];
    if (!currentPatient.intolerances) currentPatient.intolerances = [];

    const targetArray = type === 'allergy' ? currentPatient.allergies : currentPatient.intolerances;

    // Prevent duplicates
    if (targetArray.includes(name)) {
        showNotification('Déjà présent dans la liste.', 'warning');
        return;
    }

    targetArray.push(name);

    // Close search
    const searchInput = document.getElementById('allergy-search');
    const suggestionsBox = document.getElementById('allergy-suggestions');
    if (searchInput) searchInput.value = '';
    if (suggestionsBox) suggestionsBox.classList.add('hidden');

    await saveTreatmentsData(false); // Reuse existing save mechanism
    renderAllergiesAndIntolerances();
    showNotification(type === 'allergy' ? 'Allergie ajoutée' : 'Intolérance ajoutée', 'success');
};

// Remove Item
window.removeAllergy = async (index, type) => {
    if (!currentPatient) return;

    if (type === 'allergy') {
        currentPatient.allergies.splice(index, 1);
    } else {
        currentPatient.intolerances.splice(index, 1);
    }

    await saveTreatmentsData(false);
    renderAllergiesAndIntolerances();
};

function renderAllergiesAndIntolerances() {
    const listAllergies = document.getElementById('list-allergies');
    const listIntolerances = document.getElementById('list-intolerances');
    const countAllergies = document.getElementById('count-allergies');
    const countIntolerances = document.getElementById('count-intolerances');

    if (!listAllergies || !listIntolerances) return;

    const allergies = currentPatient?.allergies || [];
    const intolerances = currentPatient?.intolerances || [];

    // Update Counts
    if (countAllergies) countAllergies.textContent = allergies.length;
    if (countIntolerances) countIntolerances.textContent = intolerances.length;

    // Render Allergies
    if (allergies.length === 0) {
        listAllergies.innerHTML = `<div class="text-xs text-red-400 italic text-center py-4">Aucune allergie signalée</div>`;
    } else {
        listAllergies.innerHTML = allergies.map((item, i) => `
            <div class="flex justify-between items-center bg-white border border-red-100 rounded px-3 py-2 shadow-sm text-sm">
                <span class="text-gray-700 font-medium truncate pr-2" title="${item}">${item}</span>
                <button class="text-red-400 hover:text-red-600 transition-colors" onclick="removeAllergy(${i}, 'allergy')" title="Retirer">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }

    // Render Intolerances
    if (intolerances.length === 0) {
        listIntolerances.innerHTML = `<div class="text-xs text-orange-400 italic text-center py-4">Aucune intolérance signalée</div>`;
    } else {
        listIntolerances.innerHTML = intolerances.map((item, i) => `
            <div class="flex justify-between items-center bg-white border border-orange-100 rounded px-3 py-2 shadow-sm text-sm">
                <span class="text-gray-700 font-medium truncate pr-2" title="${item}">${item}</span>
                <button class="text-orange-400 hover:text-orange-600 transition-colors" onclick="removeAllergy(${i}, 'intolerance')" title="Retirer">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }
}
