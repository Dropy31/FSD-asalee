export const viewTitles = {
    'dashboard': 'Patients',
    'identity-protocols': 'Identité & Protocoles',
    'patient-profile': 'Profil Médical',
    'respiratory': 'Suivi Respiratoire',
    'prevention': 'Prévention',
    'cognitive': 'Cognitif',
    'followup': 'Suivi Biologique',
    'exams': 'Examens',
    'treatments': 'Traitements',
    'education': 'ETP',
    'synthesis': 'Synthèse',
    'etp-library': 'Bibliothèque',
    'pharma-book': 'Livret Pharmaceutique',
    'letters': 'Courriers',
    'templates': 'Gestion des Modèles'
};

export const updateNavigationState = (hasPatient) => {
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

export const updateNewPatientButtonVisibility = (targetId) => {
    const btn = document.getElementById('btn-new-patient');
    if (!btn) return;
    if (targetId === 'dashboard') {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
};

export const handleViewSwitch = (targetId) => {
    // HIDE ALL VIEWS
    const allViews = document.querySelectorAll('.view-section');
    allViews.forEach(v => {
        v.classList.remove('active-view');
        // Legacy support if needed, or rely solely on active-view as per recent fix
        v.classList.add('hidden');
    });

    // SHOW TARGET VIEW
    const targetView = document.getElementById(`view-${targetId}`);
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active-view');
        console.log(`Showing view: view-${targetId}`);
    } else {
        console.error(`Target view not found: view-${targetId}`);
    }

    // Update page title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle && viewTitles[targetId]) {
        pageTitle.textContent = viewTitles[targetId];
    }

    updateNewPatientButtonVisibility(targetId);

    // Update Buttons State
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-target="${targetId}"]`);
    if (activeBtn) activeBtn.classList.add('active');
};

export const initNavigation = (callbacks = {}) => {
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.disabled) {
                e.preventDefault();
                return;
            }

            const targetId = btn.getAttribute('data-target');

            // Optional Guard Check Callback (passed from renderer.js)
            if (callbacks.guardCheck && !callbacks.guardCheck(targetId)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            handleViewSwitch(targetId);

            // Lazy Load Letters Module
            if (targetId === 'letters' && window.initLettersModule) {
                window.initLettersModule();
            }

            // Lazy Load Templates Module
            if (targetId === 'templates' && window.initTemplateManager) {
                window.initTemplateManager();
            }
        });
    });

    // Initialize Dashboard
    const initDashboard = () => {
        const dashboard = document.getElementById('view-dashboard');
        if (dashboard) {
            dashboard.classList.add('active-view');
            dashboard.classList.remove('hidden');
        }
    };
    initDashboard();
    updateNavigationState(false);
    updateNewPatientButtonVisibility('dashboard');
};
