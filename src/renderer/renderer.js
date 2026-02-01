console.log('--- RENDERER.JS LOADED ---');
// import { calculateScore2Diabetes } from './utils/calculations.js'; // Loaded via script tag
// const { generateSummary } = require('./summary_engine.js'); // FIXED: Loaded via script tag
import { debounce } from './modules/utils.js';
import { initNavigation, updateNavigationState, viewTitles } from './modules/navigation.js';
import { patientManager } from './modules/patient-manager.js';
import { dashboard } from './modules/dashboard.js';

// --- UI HELPER FUNCTIONS (GLOBAL) ---
function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.warn('Toast: ' + message);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `px-6 py-3 rounded-lg shadow-lg text-white font-medium transform transition-all duration-300 translate-y-4 opacity-0 border border-white/10 flex items-center gap-3 z-50`;

    if (type === 'success') toast.classList.add('bg-gray-800');
    if (type === 'error') toast.classList.add('bg-red-600');
    if (type === 'info') toast.classList.add('bg-blue-600');
    if (type === 'warning') toast.classList.add('bg-orange-500');

    let icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'info') icon = 'info-circle';
    if (type === 'warning') icon = 'exclamation-triangle';

    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.remove('translate-y-4', 'opacity-0'));
    setTimeout(() => {
        toast.classList.add('translate-y-4', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
window.showNotification = showNotification;

function highlightError(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('ring-2', 'ring-red-500', 'border-red-500');
    setTimeout(() => el.classList.remove('ring-2', 'ring-red-500', 'border-red-500'), 3000);
}
window.highlightError = highlightError;

function shakeElement(selector) {
    const el = document.querySelector(selector);
    if (el) {
        el.classList.add('animate-shake');
        setTimeout(() => el.classList.remove('animate-shake'), 500);
    }
}
window.shakeElement = shakeElement;
// --- END UI HELPER FUNCTIONS ---

// Legacy Bridge: Expose patientManager's currentPatient to window.currentPatient
Object.defineProperty(window, 'currentPatient', {
    get: () => patientManager.currentPatient,
    set: (val) => { patientManager.currentPatient = val; },
    configurable: true
});

// Global Save Helper (Refactored to use Manager)
async function savePatients() {
    const p = patientManager.currentPatient;
    if (!p || !p.db_id) return;
    try {
        await patientManager.update(p.db_id, p);
        console.log("Global Save: Success");
    } catch (e) {
        console.error("Global Save: Failed", e);
    }
}
window.savePatients = savePatients;

document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pageTitle = document.getElementById('page-title');

    const viewTitles = {
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
        'letters': 'Courriers'
    };

    // let currentPatient = null; // Moved to global scope
    let saveTimeout = null; // For debounce

    // Helper: Debounce
    // Imported from modules/utils.js
    // const debounce = ... (removed)

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
            // Use Manager to fetch
            const patient = await patientManager.getById(id);
            if (!patient) {
                console.error('Patient not found');
                showNotification('Patient non trouvé dans la base de données.', 'error');
                return;
            }

            // Update Manager State (triggers listeners if any)
            patientManager.currentPatient = patient;

            // Populate Identity Form
            // Only populate if we are switching view OR if the ID changed (to avoid overwriting user input in progress)
            // But wait, if we just saved "Dupont", the DB has "Dupont". Overwriting "Dupont" is safe.

            if (switchView) {
                // Safe Setters Helpers
                const setSafeValue = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) {
                        // For Select elements (IDSP, GP, Bureau), if value doesn't exist in options, add it
                        if (el.tagName === 'SELECT' && val && !Array.from(el.options).some(opt => opt.value === val)) {
                            if (id === 'inp-gp' || id === 'inp-idsp' || id === 'inp-office') {
                                const opt = document.createElement('option');
                                opt.value = val;
                                opt.text = val;
                                el.add(opt);
                            }
                        }
                        el.value = val;
                    } else {
                        console.warn(`Element not found: ${id}`);
                    }
                };
                const setSafeChecked = (id, checked) => {
                    const el = document.getElementById(id);
                    if (el) el.checked = checked;
                    else console.warn(`Checkbox not found: ${id}`);
                };

                setSafeValue('patient-id', patient.db_id);
                setSafeValue('inp-lastname', patient.lastName || '');
                setSafeValue('inp-firstname', patient.firstName || '');
                setSafeValue('inp-birthdate', patient.birthDate || '');
                setSafeValue('inp-gender', patient.gender || '');
                setSafeValue('inp-diagnosis-year', patient.diagnosisYear || '');
                setSafeValue('inp-gp', patient.gp || '');
                setSafeValue('inp-office', patient.office || ''); // New Field
                setSafeValue('inp-idsp', patient.idsp || ''); // New Field
                setSafeValue('inp-phone', patient.phone || '');
                setSafeValue('inp-email', patient.email || '');
                setSafeValue('inp-emergency', patient.emergencyContact || ''); // New Field
                setSafeValue('inp-ins', patient.ins || '');
                setSafeValue('inp-diagnosis-year', patient.diagnosisYear || '');

                // Trigger Calculations
                updateAge(patient.birthDate);
                if (typeof updateDuration === 'function') {
                    updateDuration(patient.diagnosisYear);
                }

                // Populate Risk Profile
                const p = patient.riskProfile || {};
                const cv = p.cv || {};
                const macro = p.macro || {};
                const micro = p.micro || {};
                const others = p.others || {};

                setSafeValue('risk-hta', cv.hta || 'NON');
                setSafeValue('risk-dyslipidemia', cv.dyslipidemia || 'NON');
                setSafeValue('risk-tobacco', cv.tobacco || 'NON');
                setSafeValue('risk-heredity', cv.heredity || 'NON');

                setSafeValue('macro-avc', macro.avc || 'NON');
                setSafeValue('macro-coronary', macro.coronary || 'NON');
                setSafeValue('macro-aomi', macro.aomi || 'NON');
                setSafeValue('macro-stenosis', macro.stenosis || 'NON');

                setSafeValue('micro-retino', micro.retino || 'NON');
                setSafeValue('micro-nephro', micro.nephro || 'NON');
                setSafeValue('micro-neuro-sens', micro.neuroSens || 'NON');
                setSafeValue('micro-neuro-auto', micro.neuroAuto || 'NON');

                setSafeValue('other-hf', others.hf || 'NON');
                setSafeValue('other-afib', others.afib || 'NON');
                setSafeValue('other-foot', others.foot || 'Grade 0');
                setSafeValue('other-liver', others.liver || 'NON');

                // Populate Protocols
                const protocols = patient.protocols || {};
                ['dt2', 'rcva', 'smoke', 'asthme', 'bpco', 'prev', 'cog'].forEach(p => {
                    const cb = document.getElementById(`proto-${p}`);
                    setSafeChecked(`proto-${p}`, !!protocols[p]);

                    const dateInp = document.getElementById(`date-${p}`);
                    if (dateInp) {
                        dateInp.value = protocols[p] || '';
                    }

                    // Trigger Visual Update (Ensure we use our new function)
                    if (cb && typeof updateCardVisual === 'function') {
                        updateCardVisual(cb);
                    }
                });
                updateSidebarVisibility(protocols);
                updateProtocolBadges(protocols);
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
                const identityBtn = document.querySelector('[data-target="identity-protocols"]');
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
        patientManager.currentPatient = null;
        updateNavigationState(false);
        updateSidebarVisibility({}); // Hide all protocol tabs including non-diabetes medical tabs

        // Hide Banner
        const banner = document.getElementById('active-patient-banner');
        if (banner) banner.classList.add('hidden');

        // Go to Dashboard
        document.querySelector('[data-target="dashboard"]').click();

        // Clear Protocol Badges
        const badgeContainer = document.getElementById('protocol-badges');
        if (badgeContainer) badgeContainer.innerHTML = '';

        // EXPLICITLY UNCHECK PROTOCOLS to prevent ghost state
        ['dt2', 'rcva', 'smoke', 'asthme', 'bpco', 'prev', 'cog'].forEach(p => {
            const cb = document.getElementById(`proto-${p}`);
            const dateInp = document.getElementById(`date-${p}`);
            if (cb) cb.checked = false;
            if (dateInp) dateInp.value = '';
        });

        showNotification('Dossier fermé', 'info');
    };

    const btnClosePatient = document.getElementById('btn-close-patient');
    if (btnClosePatient) {
        btnClosePatient.addEventListener('click', closePatientHandler);
    }

    // --- Navigation Logic ---
    // Wired to modules/navigation.js
    initNavigation({
        guardCheck: (targetId) => {
            const patientTabs = ['patient-profile', 'respiratory', 'prevention', 'cognitive', 'followup', 'exams', 'treatments', 'education', 'letters', 'synthesis'];
            if (patientTabs.includes(targetId)) {
                const birthDate = document.getElementById('inp-birthdate').value;
                const gender = document.getElementById('inp-gender').value;

                if (!birthDate || !gender) {
                    shakeElement('#form-identity');
                    // showNotification is likely global or we need to find it ?? 
                    // Assuming showNotification is available or we use alert fallback if fails?
                    // actually showNotification appears used in line 189 so it must exist.
                    if (window.showNotification) window.showNotification('Le Sexe et la Date de Naissance sont obligatoires.', 'error');
                    else console.warn('showNotification not found');

                    if (!birthDate) highlightError('inp-birthdate');
                    if (!gender) highlightError('inp-gender');

                    // Switch to Identity
                    const identityBtn = document.querySelector('[data-target="identity-protocols"]');
                    if (identityBtn) identityBtn.click();

                    return false; // Block navigation
                }
            }
            return true; // Allow navigation
        }
    });


    document.querySelector('[data-target="dashboard"]').click();

    // --- Data Loading & Dashboard Logic ---
    // Delegated to dashboard module
    dashboard.init(openPatientHandler, closePatientHandler);

    // Initial Load - Force it
    console.log('Triggering initial dashboard.refresh...');
    // Small delay to ensure DOM is ready? (Logic is inside DOMContentLoaded so unnecessary but safe)
    setTimeout(() => dashboard.refresh(), 500);

    // Restore Data Loading Trigger (Refresh on dashboard click)
    const dashboardBtn = document.querySelector('[data-target="dashboard"]');
    if (dashboardBtn) {
        dashboardBtn.addEventListener('click', () => dashboard.refresh());
    } else {
        console.error('CRITICAL: Dashboard button not found!');
    }

    // Debug View State
    setTimeout(() => {
        const dash = document.getElementById('view-dashboard');
        if (dash) console.log('Dashboard View State:', dash.className, 'Display:', window.getComputedStyle(dash).display);
    }, 1000);



    // New Patient Button (Delegated Event for Stability)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#btn-new-patient');
        if (!btn) return;

        console.log('New Patient button clicked (delegated)');

        try {
            patientManager.currentPatient = null; // Reset current patient context

            // 1. Clear Form (Identity & Risks)
            document.getElementById('patient-id').value = '';
            const form = document.getElementById('form-identity');
            if (form) form.reset();

            // 2. Clear Bio History & Chart
            // Guard against missing functions
            if (typeof renderHistoryTable === 'function') renderHistoryTable([]);
            if (typeof renderEvolutionChart === 'function') renderEvolutionChart([]);

            // 3. Clear Exams
            if (typeof loadExamsData === 'function') loadExamsData(null);

            // 4. Clear Medical Profile (Robust Reset)
            const profileForm = document.getElementById('form-profile');
            if (profileForm) {
                profileForm.reset();
                console.log("Profile form reset");
            }

            // Reset Protocol Cards Visually
            resetProtocolCards();

            // EXPLICITLY UNCHECK PROTOCOLS (Safety Net - still good to keep synced)
            ['dt2', 'rcva', 'smoke', 'asthme', 'bpco', 'prev', 'cog'].forEach(p => {
                const cb = document.getElementById(`proto-${p}`);
                const dateInp = document.getElementById(`date-${p}`);
                if (cb) cb.checked = false;
                if (dateInp) dateInp.value = '';
            });

            // Ensure Diagnosis Year is definitively clear
            const inputYear = document.getElementById('inp-diagnosis-year');
            if (inputYear) inputYear.value = '';

            // Re-reset duration text explicitly
            const durEl = document.getElementById('calc-duration');
            if (durEl) durEl.textContent = '--';

            // Explicitly enable all inputs
            if (form) {
                Array.from(form.elements).forEach(el => {
                    el.disabled = false;
                    el.readOnly = false;
                });
            }
            if (profileForm) {
                Array.from(profileForm.elements).forEach(el => {
                    el.disabled = false;
                    el.readOnly = false;
                });
            }

            const ageEl = document.getElementById('inp-age');
            if (ageEl) ageEl.value = '--';

            // Hide Banner
            const banner = document.getElementById('active-patient-banner');
            if (banner) banner.classList.add('hidden');

            // Reset Sidebar to basics (hide all protocol specific)
            updateSidebarVisibility({});

            // Enable Navigation (Identity + Courriers)
            updateNavigationState(true);

            // MANUALLY DISABLE COURRIERS for New Patient until saved
            const mailBtn = document.querySelector('[data-target="letters"]');
            if (mailBtn) {
                mailBtn.disabled = true;
                mailBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }

            // Switch to Identity View
            const identityBtn = document.querySelector('[data-target="identity-protocols"]');
            if (identityBtn) identityBtn.click();

        } catch (err) {
            console.error("Critical Error in New Patient Flow:", err);
            if (window.showNotification) window.showNotification("Erreur lors de la création: " + err.message, 'error');
        }
    });

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
            office: document.getElementById('inp-office').value, // New Field
            idsp: document.getElementById('inp-idsp').value, // New Field
            phone: document.getElementById('inp-phone').value,
            email: document.getElementById('inp-email').value,
            emergencyContact: document.getElementById('inp-emergency').value, // New field
            ins: document.getElementById('inp-ins').value,

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
            },
            protocols: (() => {
                const p = {};
                ['dt2', 'rcva', 'smoke', 'asthme', 'bpco', 'prev', 'cog'].forEach(key => {
                    const cb = document.getElementById(`proto-${key}`);
                    const dateInp = document.getElementById(`date-${key}`);
                    if (cb && cb.checked) {
                        p[key] = dateInp.value || new Date().toISOString().split('T')[0];
                    }
                });
                return p;
            })()
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
                // Update existing using Manager
                // Note: The manager updates local state automatically if ID matches
                await patientManager.update(parseInt(id), patientData);
                resultId = parseInt(id);
                console.log('Update successful, ID:', resultId);

                // Refresh list logic only needed if we don't reload context, but openPatientHandler handles everything
                dashboard.refresh();
            } else {
                // Create new using Manager
                resultId = await patientManager.create(patientData);
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
            if (id) dashboard.refresh();

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
    // --- Formating Helpers ---
    function toTitleCase(str) {
        if (!str) return '';
        return str.toLowerCase().split(' ').map(word => {
            return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
    }

    // --- Name Auto-Formatting ---
    const inpNom = document.getElementById('inp-lastname');
    const inpPrenom = document.getElementById('inp-firstname');

    if (inpNom) {
        inpNom.addEventListener('blur', () => {
            if (inpNom.value) {
                inpNom.value = inpNom.value.toUpperCase();
                // Update Sidebar Banner
                const bannerName = document.getElementById('active-patient-name');
                const firstName = document.getElementById('inp-firstname').value;
                if (bannerName) {
                    bannerName.textContent = `${inpNom.value} ${firstName}`;
                }
                // Trigger change event to ensure autosave/updates catch it
                inpNom.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    if (inpPrenom) {
        inpPrenom.addEventListener('blur', () => {
            if (inpPrenom.value) {
                inpPrenom.value = toTitleCase(inpPrenom.value);
                // Update Sidebar Banner
                const bannerName = document.getElementById('active-patient-name');
                const lastName = document.getElementById('inp-lastname').value;
                if (bannerName) {
                    bannerName.textContent = `${lastName} ${inpPrenom.value}`;
                }
                // Trigger change event to ensure autosave/updates catch it
                inpPrenom.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    // --- Phone & Email Helpers ---
    const inpPhone = document.getElementById('inp-phone');
    const inpEmail = document.getElementById('inp-email');

    if (inpPhone) {
        inpPhone.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, ''); // Remove non-digits
            if (val.length > 10) val = val.substring(0, 10); // Limit to 10

            // Format: 00 00 00 00 00
            const parts = [];
            for (let i = 0; i < val.length; i += 2) {
                parts.push(val.substring(i, i + 2));
            }
            e.target.value = parts.join(' ');
        });
    }

    if (inpEmail) {
        inpEmail.addEventListener('blur', () => {
            const val = inpEmail.value;
            // Basic RFC 5322 regex
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (val && !emailRegex.test(val)) {
                // Simple ergonomic feedback: Red border if invalid
                inpEmail.classList.add('border-red-500', 'bg-red-50');
            } else {
                inpEmail.classList.remove('border-red-500', 'bg-red-50');
            }
        });
    }

    // --- INS Formatting ---
    const inpIns = document.getElementById('inp-ins');
    if (inpIns) {
        inpIns.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, ''); // Digits only
            if (val.length > 15) val = val.substring(0, 15);

            // Format: 1 23 45 67 890 123 45 (Standard NIR format)
            // Groups: 1, 2, 2, 2, 3, 3, 2
            let formatted = '';
            const groups = [1, 2, 2, 2, 3, 3, 2];
            let idx = 0;

            for (let g of groups) {
                if (idx >= val.length) break;
                let chunk = val.substring(idx, idx + g);
                formatted += chunk + ' ';
                idx += g;
            }
            e.target.value = formatted.trim();
        });
    }

    // Auto-Save Logic with Debounce
    function triggerAutoSave() {
        // Auto-Save Listeners (Specific Targets to prevent bleeding)
        const identityInputs = [
            'inp-lastname', 'inp-firstname', 'inp-birthdate', 'inp-diagnosis-year',
            'risk-dyslipidemia', 'risk-tobacco', 'risk-heredity',
            'macro-avc', 'macro-coronary', 'macro-aomi', 'macro-stenosis',
            'micro-retino', 'micro-nephro', 'micro-neuro-sens', 'micro-neuro-auto',
            'other-hf', 'other-af',
            'inp-gender', 'inp-gp', 'inp-office', 'inp-idsp', 'inp-phone', 'inp-email', 'inp-ins', 'inp-emergency'
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
            // Diagnosis Year moved to Medical Profile
            // Listener will be re-attached or handled via 'change' event on the new element
            inpDiagnosisYear.addEventListener('input', (e) => {
                updateDuration(e.target.value);
            });
        }

        // Initialize Date Field to Today
        const bioDateInput = document.getElementById('bio-date');
        if (bioDateInput) {
            bioDateInput.valueAsDate = new Date();
        }
    }
    triggerAutoSave(); // Invoke the function

    // Initialize Biological Module
    initBiologicalFollowUp();

    // Initialize Exams Module
    initExamsModule();
    initTreatmentsModule();
    initEducationModule();
    initSynthesisModule();
    if (window.initPharmaBook) window.initPharmaBook();
    if (window.initTemplateManager) window.initTemplateManager();
    if (window.initTemplateManager) window.initTemplateManager();
    initProtocolLogic(() => saveIdentityForm(false)); // Pass auto-save callback
});

// --- Protocol Logic ---
// --- Protocol Logic ---
function initProtocolLogic(onSaveCallback) {
    const protocols = ['dt2', 'rcva', 'smoke', 'asthme', 'bpco', 'prev', 'cog'];

    // Shared visual update function
    window.updateProtocolCardVisuals = (p) => {
        const checkbox = document.getElementById(`proto-${p}`);
        const card = document.getElementById(`card-${p}`);
        if (!checkbox || !card) return;

        const colorKey = checkbox.dataset.color || 'blue';
        const colorMap = {
            green: '#16a34a', // green-600
            red: '#dc2626',   // red-600
            blue: '#2563eb',  // blue-600
            yellow: '#ca8a04', // yellow-600
            purple: '#9333ea' // purple-600
        };

        if (checkbox.checked) {
            // Active
            card.classList.remove('bg-gray-50', 'border-gray-200', 'hover:border-blue-300');
            card.classList.add(`bg-${colorKey}-100`);
            // Use inline style to guarantee border color
            card.style.borderColor = colorMap[colorKey];
            card.style.borderWidth = '2px';
        } else {
            // Inactive
            card.classList.remove(`bg-${colorKey}-100`);
            card.style.borderColor = ''; // Reset to CSS default
            card.style.borderWidth = '';
            card.classList.add('bg-gray-50', 'border-gray-200', 'hover:border-blue-300');
        }
    };

    protocols.forEach(p => {
        const checkbox = document.getElementById(`proto-${p}`);
        const dateInput = document.getElementById(`date-${p}`);

        if (checkbox) {
            checkbox.addEventListener('change', () => {
                // Update Style
                window.updateProtocolCardVisuals(p);

                // Auto-Populate Date
                if (checkbox.checked && dateInput && !dateInput.value) {
                    dateInput.valueAsDate = new Date();
                }

                // Notification
                if (checkbox.checked) {
                    const protocolNames = {
                        dt2: 'Diabète Type 2',
                        rcva: 'Risque CV Absolu',
                        smoke: 'Sevrage Tabagique',
                        asthme: 'Asthme',
                        bpco: 'BPCO',
                        prev: 'Prévention Syst.',
                        cog: 'Troubles Cognitifs'
                    };
                    showNotification(`Patient inclus dans le protocole : ${protocolNames[p] || p.toUpperCase()}`, 'success');
                }

                // Update Sidebar and Badges
                updateSidebarVisibility();
                updateProtocolBadges();

                if (onSaveCallback) onSaveCallback();
            });

            // Also save on date change
            if (dateInput) {
                dateInput.addEventListener('change', () => {
                    if (onSaveCallback) onSaveCallback();
                });
            }
        }
    });
}

function updateProtocolBadges(overrideProtocols = null) {
    const container = document.getElementById('protocol-badges');
    if (!container) return;

    container.innerHTML = '';

    let active = {};
    if (overrideProtocols) {
        active = overrideProtocols;
    } else {
        ['dt2', 'rcva', 'smoke', 'asthme', 'bpco', 'prev', 'cog'].forEach(p => {
            const cb = document.getElementById(`proto-${p}`);
            if (cb && cb.checked) active[p] = true;
        });
    }

    // Definitions
    const definitions = [
        { key: 'rcva', label: 'RCVA', color: 'bg-red-100 text-red-800' },
        { key: 'dt2', label: 'DT2', color: 'bg-green-100 text-green-800' },
        { key: 'smoke', label: 'BAT', color: 'bg-blue-100 text-blue-800' }, // BAT = Smoke/Asthme/BPCO group
        { key: 'asthme', label: 'BAT', color: 'bg-blue-100 text-blue-800' },
        { key: 'bpco', label: 'BAT', color: 'bg-blue-100 text-blue-800' },
        { key: 'cog', label: 'COG', color: 'bg-yellow-100 text-yellow-800' },
        { key: 'prev', label: 'Prev', color: 'bg-purple-100 text-purple-800' }
    ];

    const badges = new Set(); // Avoid duplicates for BAT group

    definitions.forEach(def => {
        if (active[def.key]) {
            const id = `${def.label}-${def.color}`;
            if (!badges.has(id)) {
                badges.add(id);
                const span = document.createElement('span');
                // Revert size for banner: text-[10px], standard padding
                span.className = `inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none uppercase tracking-wide opacity-90 ${def.color}`;
                span.textContent = def.label;
                container.appendChild(span);
            }
        }
    });
}

function updateSidebarVisibility(overrideProtocols = null) {
    // Determine active protocols
    let activeProtocols = {};

    if (overrideProtocols) {
        activeProtocols = overrideProtocols;
    } else {
        // Read from DOM
        ['dt2', 'rcva', 'smoke', 'asthme', 'bpco', 'prev', 'cog'].forEach(p => {
            const cb = document.getElementById(`proto-${p}`);
            if (cb && cb.checked) activeProtocols[p] = true;
        });
    }

    // Logic for Tabs
    // PROFILE (Risk Grid) -> DT2 or RCVA
    const showProfile = activeProtocols.dt2 || activeProtocols.rcva;
    toggleNav('patient-profile', showProfile);

    // Strict Visibility: Hide Bio, Exams, Treatments, ETP, Synthesis if !DT2 (RCVA does not use these)
    const isDiabetes = activeProtocols.dt2;
    const medicalTabs = ['followup', 'exams', 'treatments', 'education', 'synthesis'];
    medicalTabs.forEach(tab => {
        toggleNav(tab, isDiabetes);
    });

    // RESPIRATORY -> Asthma or BPCO or Smoke
    const showResp = activeProtocols.asthme || activeProtocols.bpco || activeProtocols.smoke;
    toggleNav('respiratory', showResp);

    // PREVENTION -> Prev
    toggleNav('prevention', activeProtocols.prev);

    // COGNITIVE -> Cog
    toggleNav('cognitive', activeProtocols.cog);

    // Show/Hide Specific Protocols Header
    const hasSpecific = showResp || activeProtocols.prev || activeProtocols.cog;
    const header = document.getElementById('section-protocols');
    if (header) {
        if (hasSpecific) header.classList.remove('hidden');
        else header.classList.add('hidden');
    }
}

function toggleNav(targetId, visible) {
    const item = document.getElementById(`nav-item-${targetId.replace('patient-', '')}`); // nav-item-profile vs patient-profile
    // My IDs in HTML: nav-item-profile, nav-item-respiratory, etc.
    // targetId: patient-profile -> nav-item-profile? Yes.
    // targetId: respiratory -> nav-item-respiratory.

    let domId = `nav-item-${targetId}`;
    if (targetId === 'patient-profile') domId = 'nav-item-profile';

    const el = document.getElementById(domId);
    if (el) {
        if (visible) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }
}

// Helper Functions
// Helper Functions
function updateAge(birthDateStr) {
    const el = document.getElementById('inp-age');
    if (!el) return;
    if (!birthDateStr) {
        el.value = '--';
        return;
    }
    const age = calculateAge(birthDateStr);
    el.value = age + ' ans';
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

// Restore updateDuration
const updateDuration = (yearStr) => {
    const el = document.getElementById('calc-duration');
    if (!el) return;

    if (!yearStr) {
        el.textContent = '--';
        return;
    }

    const start = parseInt(yearStr);
    const current = new Date().getFullYear();
    const duration = current - start;

    if (isNaN(duration) || duration < 0) {
        el.textContent = '--';
    } else {
        el.textContent = duration + ' ans';
    }
};


// debounce imported from modules/utils.js

// (Removed duplicate UI helpers - see top of file)



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


// --- 4. PROTOCOL CARD LOGIC ---

// Helper to reset visual state (Ghosting Fix)
function resetProtocolCards() {
    const cards = document.querySelectorAll('.protocol-card');
    cards.forEach(card => {
        // Remove all active classes
        card.classList.remove('bg-green-100', 'bg-red-100', 'bg-blue-100', 'bg-yellow-100', 'bg-purple-100');
        card.classList.remove('border-green-300', 'border-red-300', 'border-blue-300', 'border-yellow-300', 'border-purple-300');
        card.classList.remove('ring-2', 'ring-green-500', 'ring-red-500', 'ring-blue-500', 'ring-yellow-500', 'ring-purple-500');

        // Reset to default
        card.classList.add('bg-gray-50', 'border-gray-200');
    });
}

// Delegated Listener for Validation and Visuals
const protocolGrid = document.getElementById('protocol-grid');
if (protocolGrid) {
    protocolGrid.addEventListener('click', (e) => {
        // Find the card being clicked
        const card = e.target.closest('.protocol-card');
        if (!card) return;

        // --- VALIDATION GUARD ---
        const lastName = document.getElementById('inp-lastname').value.trim();
        const firstName = document.getElementById('inp-firstname').value.trim();
        const birthDate = document.getElementById('inp-birthdate').value;
        const gender = document.getElementById('inp-gender').value;

        if (!lastName || !firstName || !birthDate || !gender) {
            e.preventDefault(); // Stop the checkbox toggle
            e.stopPropagation();

            // Visual Feedback (Shake or Alert)
            alert("Veuillez renseigner l'Identité du patient (Nom, Prénom, Date de Naissance, Sexe) avant de sélectionner un protocole.");

            // Highlight missing fields
            if (!lastName) highlightError('inp-lastname');
            if (!firstName) highlightError('inp-firstname');
            if (!birthDate) highlightError('inp-birthdate');
            if (!gender) highlightError('inp-gender');

            return;
        }

        // Note: The actual visual toggling (bg colors) works via CSS peer-checked or separate JS?
        // If it was JS, we'd see it. Looking at index.html, it seems purely detailed JS logic was missing or implied?
        // Actually, looking at index.html, classes like `peer-checked:block` handle the date input input visibility.
        // But the BACKGROUND color of the card is likely handled by a change listener I missed or need to add.
        // Let's ADD a visual updater here to be sure.

        // The click event happens before the change? or triggers it.
        // We can listen to 'change' on the grid for robust visual updates.
    });

    // Separate Change Listener for Visuals (Color Toggling)
    protocolGrid.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.dataset.protocol) {
            updateCardVisual(e.target);
        }
    });
}

function updateCardVisual(checkbox) {
    const card = checkbox.closest('.protocol-card');
    const color = checkbox.dataset.color || 'blue'; // default

    // Map simple color names to Tailwind classes
    const colorMap = {
        'green': { bg: 'bg-green-100', border: 'border-green-300', ring: 'ring-green-500' },
        'red': { bg: 'bg-red-100', border: 'border-red-300', ring: 'ring-red-500' },
        'blue': { bg: 'bg-blue-100', border: 'border-blue-300', ring: 'ring-blue-500' },
        'yellow': { bg: 'bg-yellow-100', border: 'border-yellow-300', ring: 'ring-yellow-500' },
        'purple': { bg: 'bg-purple-100', border: 'border-purple-300', ring: 'ring-purple-500' },
    };

    const classes = colorMap[color];

    if (checkbox.checked) {
        card.classList.remove('bg-gray-50', 'border-gray-200');
        card.classList.add(classes.bg, classes.border, 'ring-2', classes.ring);
    } else {
        // Reset specific active classes first
        card.classList.remove(classes.bg, classes.border, 'ring-2', classes.ring);
        // Add default
        card.classList.add('bg-gray-50', 'border-gray-200');
    }
}
// Ensure Visuals are updated on load (populating from DB) - Call this after loading patient


// --- HISTORY TABLE & CHART ---
function renderHistoryTable_UNUSED(data) {
    const tbody = document.getElementById('table-history'); // Verify ID in Step 300?? history-table-body?
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!data || data.length === 0) {
        // Optional: show empty row
        return;
    }

    // Sort by date desc
    const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-4 py-2">${new Date(entry.date).toLocaleDateString()}</td>
            <td class="px-4 py-2">${entry.hba1c || '-'}</td>
            <td class="px-4 py-2">${entry.ldl || '-'}</td>
            <td class="px-4 py-2">${entry.weight || '-'}</td>
            <td class="px-4 py-2 text-right">
                <button class="text-red-500 hover:text-red-700" onclick="deleteHistoryEntry('${entry.date}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}
// window.renderHistoryTable = renderHistoryTable;

// function renderEvolutionChart(data) removed - duplicate of line 1986

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
        if (type === 'creat') return parseFloat(value.toFixed(2));
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
                <h4 class="font-bold mb-1"><i class="fas fa-info-circle"></i> Non àligible au Calcul</h4>
                <p>Le modèle SCORE2-Diabetes n'est validé que pour les patients à¢gés de <strong>40 à 69 ans</strong>.</p>
                <p class="mt-2 text-xs text-gray-500">àge actuel : ${isNaN(age) ? '--' : age} ans.</p>
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

    // Fixed Headers (Requested: Bold Label, lowercase unit, fixed units)
    const thClass = "px-3 py-2 bg-gray-50 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200";

    thead.innerHTML = `
        <tr>
            <th class="${thClass}">Date</th>
            <th class="${thClass}">Poids<br><span class="text-[10px] font-normal text-gray-500 lowercase">(kg)</span></th>
            <th class="${thClass}">IMC<br><span class="text-[10px] font-normal text-gray-500 lowercase">(kg/m²)</span></th>
            <th class="${thClass}">PAS<br><span class="text-[10px] font-normal text-gray-500 lowercase">(mmhg)</span></th>
            <th class="${thClass}">PAD<br><span class="text-[10px] font-normal text-gray-500 lowercase">(mmhg)</span></th>
            <th class="${thClass}">Créat<br><span class="text-[10px] font-normal text-gray-500 lowercase">(µmol/l)</span></th>
            <th class="${thClass}">DFG<br><span class="text-[10px] font-normal text-gray-500 lowercase">(ml/min)</span></th>
            <th class="${thClass}">RAC<br><span class="text-[10px] font-normal text-gray-500 lowercase">(mg/mmol)</span></th>
            <th class="${thClass}">CT<br><span class="text-[10px] font-normal text-gray-500 lowercase">(g/l)</span></th>
            <th class="${thClass}">TG<br><span class="text-[10px] font-normal text-gray-500 lowercase">(g/l)</span></th>
            <th class="${thClass}">LDLc<br><span class="text-[10px] font-normal text-gray-500 lowercase">(g/l)</span></th>
            <th class="${thClass}">HbA1c<br><span class="text-[10px] font-normal text-gray-500 lowercase">(%)</span></th>
            <th class="${thClass}">SCORE2<br><span class="text-[10px] font-normal text-gray-500 lowercase">(%)</span></th>
            <th class="${thClass}">Actions</th>
        </tr>
    `;

    tbody.innerHTML = '';

    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="text-center py-4 text-gray-500">Aucun historique disponible</td></tr>';
        return;
    }

    history.forEach((entry, index) => {
        const row = document.createElement('tr');

        // FORCE FIXED CONVERSIONS for Table Display
        // Creat: Base(mg/L) -> µmol/L (Factor 8.84)
        // RAC: Base(mg/g) -> mg/mmol (Factor 0.113)
        // Lipids: Base(g/L) -> g/L (No conversion)

        const dispCreat = formatValueForDisplay(entry.creat, 'creat', 'µmol/L'); // Base -> Derived
        const dispRac = formatValueForDisplay(entry.rac, 'rac', 'mg/mmol'); // Base -> Derived

        // Lipids (Base is g/L, Target is g/L)
        const dispLipids = (val) => formatValueForDisplay(val, 'lipid', 'g/L');

        // Score Icon Logic
        let iconHtml = '<span class="text-gray-400">-</span>';
        if (entry.score2d === 'N/A' || entry.score2d === 'T. Élevé' || entry.score2d === 'T. à‰levé') { // Handle legacy corrupt too if present
            // Override or Ineligible
            const isOverride = (entry.score2d === 'T. Élevé' || entry.score2d === 'T. à‰levé');
            // For table we just want the text or icon?
            // User just mentioned "T. Élevé" display.
            // If stored as text "T. Élevé", display it.
            const val = (entry.score2d === 'T. à‰levé') ? 'T. Élevé' : entry.score2d;
            const colorClass = (val === 'T. Élevé') ? 'text-red-600 font-bold' : 'text-orange-500 font-bold';
            iconHtml = `<span class="${colorClass} text-xs">${val}</span>`;
        } else if (entry.score2d) {
            // Calculated
            const val = entry.score2d;
            const colorClass = getScoreColorClass(val);
            iconHtml = `<span class="font-bold ${colorClass}">${val}</span>`;
        } else {
            // Check if it should have been calculated?
            // Just show ? if missing
            const hasMissing = !entry.sys || !entry.ct || !entry.hdl || !entry.dfg || !entry.hba1c;
            if (hasMissing) {
                iconHtml = `<i class="fas fa-question text-gray-400 text-lg" title="Données manquantes"></i>`;
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
                showNotification('Aucune prescription ï¿½ï¿½ copier.', 'warning');
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
        showNotification('Veuillez d\'abord crï¿½ï¿½er ou ouvrir un patient.', 'error');
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
        imc: { val: null, date: null, min: 18, max: 45, step: 3, decimals: 1, label: 'IMC (kg/mÂ²)' },
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
        if (curr === null || prev === null) return '<div class="w-6 h-6 rounded bg-gray-200 flex items-center justify-center mx-auto"><span class="text-gray-500 font-bold text-xs">â¢</span></div>';
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
    if (confirm("àtes-vous sûr de vouloir supprimer cette séance du référentiel ?")) {
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
    initSummaryModule();
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

// --- SUMMARY & EXPORT MODULE ---

function initSummaryModule() {
    const btnGenerate = document.getElementById('btn-generate-summary');
    const btnCopy = document.getElementById('btn-copy-summary');
    const btnPdf = document.getElementById('btn-export-pdf');
    const selectTemplate = document.getElementById('summary-template-select');
    const editor = document.getElementById('summary-editor');

    if (btnGenerate && editor && selectTemplate) {
        btnGenerate.addEventListener('click', async () => {
            if (!currentPatient) {
                showNotification("Veuillez d'abord ouvrir un dossier patient.", "warning");
                return;
            }
            try {
                let text = "";
                const val = selectTemplate.value;

                if (val.startsWith('custom_')) {
                    const id = parseInt(val.replace('custom_', ''));
                    // Fetch templates to find the content
                    // Optimization: Could cache this list or add specific API
                    const templates = await window.electronAPI.getTemplates();
                    const tpl = templates.find(t => t.id === id);
                    if (tpl) {
                        text = window.renderTemplate(tpl.content, currentPatient);
                    } else {
                        text = "Erreur: Modèle introuvable (peut-être supprimé ?).";
                    }
                } else {
                    text = window.generateSummary(currentPatient, val);
                }

                editor.value = text;
                showNotification("Résumé généré avec succès", "success");
            } catch (err) {
                console.error("Summary Generation Error:", err);
                showNotification("Erreur lors de la génération", "error");
            }
        });
    }

    if (btnCopy && editor) {
        btnCopy.addEventListener('click', () => {
            if (!editor.value) return;
            navigator.clipboard.writeText(editor.value)
                .then(() => showNotification("Copié dans le presse-papiers", "success"))
                .catch(err => showNotification("à0 chec de la copie", "error"));
        });
    }

    if (btnPdf && editor) {
        btnPdf.addEventListener('click', () => {
            if (!editor.value) {
                showNotification("Rien à exporter. Générez d'abord un résumé.", "warning");
                return;
            }
            printSummaryToPdf(editor.value);
        });
    }
}

function printSummaryToPdf(text) {
    // 1. Create a hidden iframe or print window logic
    // We'll use a hidden div + @media print styles for simplicity and better control in Electron

    // Create print container if not exists
    let printContainer = document.getElementById('print-container');
    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'print-container';
        document.body.appendChild(printContainer);
    }

    // Format text (convert newlines to <br>)
    const formattedText = text.replace(/\n/g, '<br>');

    // Header Info
    const today = new Date().toLocaleDateString('fr-FR');

    // Structure
    printContainer.innerHTML = `
        <div class="print-content">
            <div class="header">
                <h1>Dossier Patient - ASALEE</h1>
                <p>Date : ${today}</p>
            </div>
            <div class="body">
                ${formattedText}
            </div>
            <div class="footer">
                <p>Généré par Diabetes Desktop Secure â¬ ¢ Données confidentielles</p>
            </div>
        </div>
    `;

    // Trigger Print
    window.print();

    // Cleanup (Optional, or leave for next time)
    // printContainer.innerHTML = '';
}

// --- Template Manager Module ---

async function initTemplateManager() {
    console.log("[Templates] initTemplateManager START");
    // window.initTemplateManager = initTemplateManager; // Removed from here
    const listContainer = document.getElementById('template-list-container');
    console.log("[Templates] listContainer found:", !!listContainer);
    const macroListContainer = document.getElementById('macro-list-container');
    const editorPanel = document.getElementById('template-editor-panel');
    const emptyState = document.getElementById('template-editor-empty');
    const btnNew = document.getElementById('btn-new-template');

    // Inputs
    const inpName = document.getElementById('inp-tpl-name');
    const inpCategory = document.getElementById('inp-tpl-category');
    const inpContent = document.getElementById('inp-tpl-content');
    const btnSave = document.getElementById('btn-save-template');
    const btnEdit = document.getElementById('btn-edit-template');
    const btnDelete = document.getElementById('btn-delete-template');

    let currentTemplateId = null;

    // Load available macros
    renderMacroList();

    // Load templates
    await loadTemplatesList();

    // --- Actions ---

    // Inject "Gestion des Macros" button
    if (btnNew && !document.getElementById('btn-manage-macros')) {
        const btnMacros = document.createElement('button');
        btnMacros.id = 'btn-manage-macros';
        btnMacros.className = "flex items-center gap-2 px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm active:translate-y-0.5";
        btnMacros.innerHTML = '<i class="fas fa-cubes text-purple-600"></i> Macros';
        btnNew.parentNode.insertBefore(btnMacros, btnNew.nextSibling);

        btnMacros.addEventListener('click', () => {
            openMacroManager();
        });
    }

    btnNew.addEventListener('click', () => {
        currentTemplateId = null;
        inpName.value = "";
        inpCategory.value = "courrier";
        inpContent.value = "";
        showEditor(true);
        inpName.focus();
    });

    btnSave.addEventListener('click', async () => {
        if (!inpName.value.trim()) {
            showNotification("Le nom du modèle est requis.", 'error');
            return;
        }

        const data = {
            name: inpName.value.trim(),
            category: inpCategory.value,
            content: inpContent.value
        };

        try {
            if (currentTemplateId) {
                await window.electronAPI.updateTemplate(currentTemplateId, data);
                showNotification("Modèle mis à jour.");
            } else {
                const res = await window.electronAPI.createTemplate(data);
                currentTemplateId = res.id;
                showNotification("Modèle créé.");
            }
            await loadTemplatesList();
            updateSynthesisDropdown(); // Refresh dropdown in other tab
        } catch (err) {
            console.error(err);
            showNotification("Erreur lors de l'enregistrement", 'error');
        }
    });

    if (btnEdit) {
        btnEdit.addEventListener('click', () => {
            if (!currentTemplateId) return;
            showEditor(true);
            inpContent.focus();
            showNotification("Mode édition activé (les champs sont déverrouillés)");
        });
    }

    btnDelete.addEventListener('click', async () => {
        if (!currentTemplateId) return;
        if (!confirm("Voulez-vous vraiment supprimer ce modèle ?")) return;

        try {
            await window.electronAPI.deleteTemplate(currentTemplateId);
            showNotification("Modèle supprimé.");
            currentTemplateId = null;
            showEditor(false);
            await loadTemplatesList();
            updateSynthesisDropdown();
        } catch (err) {
            console.error(err);
            showNotification("Erreur lors de la suppression", 'error');
        }
    });

    function showEditor(show) {
        if (show) {
            editorPanel.classList.remove('hidden');
            emptyState.classList.add('hidden');
        } else {
            editorPanel.classList.add('hidden');
            emptyState.classList.remove('hidden');
        }
    }

    async function loadTemplatesList() {
        try {
            const templates = await window.electronAPI.getTemplates();
            listContainer.innerHTML = "";

            if (templates.length === 0) {
                listContainer.innerHTML = `<div class="text-center text-gray-400 text-sm py-4">Aucun modèle.</div>`;
                return;
            }

            // Group by category
            const grouped = templates.reduce((acc, t) => {
                acc[t.category] = acc[t.category] || [];
                acc[t.category].push(t);
                return acc;
            }, {});

            Object.keys(grouped).forEach(cat => {
                const catHeader = document.createElement('div');
                catHeader.className = "px-3 py-1.5 bg-gray-100 text-xs font-bold text-gray-600 uppercase mt-2 first:mt-0";
                catHeader.textContent = cat;
                listContainer.appendChild(catHeader);

                grouped[cat].forEach(t => {
                    const item = document.createElement('div');
                    item.className = "px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 flex justify-between items-center transition-colors border-b border-gray-50 last:border-0";
                    item.innerHTML = `<span>${t.name}</span> <i class="fas fa-chevron-right text-xs text-gray-300"></i>`;

                    item.addEventListener('click', () => {
                        selectTemplate(t);
                    });

                    listContainer.appendChild(item);
                });
            });

        } catch (err) {
            console.error(err);
            listContainer.innerHTML = `<div class="text-red-500 text-sm p-4">Erreur chargement.</div>`;
        }
    }

    function selectTemplate(t) {
        currentTemplateId = t.id;
        inpName.value = t.name;
        inpCategory.value = t.category;
        inpContent.value = t.content || "";
        showEditor(true);
    }

    function renderMacroList() {
        const macros = window.getAvailableMacros();
        const container = document.getElementById('macro-list-container');
        const filterSelect = document.getElementById('macro-category-filter');

        container.innerHTML = "";

        if (!macros || macros.length === 0) {
            container.innerHTML = `<div class="p-4 text-xs text-gray-400 text-center italic">Aucune macro disponible.<br>Si les macros ont disparu, redémarrez l'application.</div>`;
            return;
        }

        // Define Category Order
        const orderedCategories = [
            "Identité",
            "Profil",
            "Biologie",
            "Date",
            "Examens",
            "Traitement",
            "Signature",
            "Autres",
            "Textes Médicaux",
            "Clinique",
            "Statut"
        ];

        // 1. Populate Filter if empty
        if (filterSelect && filterSelect.options.length === 0) {
            orderedCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                filterSelect.appendChild(opt);
            });
            // Select first by default
            filterSelect.value = orderedCategories[0];

            // Add listener
            filterSelect.addEventListener('change', () => {
                renderFilteredMacros(filterSelect.value);
            });
        }

        // Helper to render filtered list
        function renderFilteredMacros(category) {
            container.innerHTML = "";

            const filtered = macros.filter(m => m.category === category || (category === 'Autres' && !orderedCategories.includes(m.category)));

            if (filtered.length === 0) {
                container.innerHTML = `<div class="p-4 text-xs text-gray-400 text-center italic">Aucune macro dans cette catégorie.</div>`;
                return;
            }

            const grid = document.createElement('div');
            grid.className = "flex flex-wrap gap-2";

            filtered.forEach(m => {
                const chip = document.createElement('button');
                // Colors
                let colorClass = "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100";
                if (m.type === 'text') colorClass = "bg-green-50 text-green-700 border-green-100 hover:bg-green-100";
                if (m.type === 'value') colorClass = "bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100";
                if (m.type === 'script') colorClass = "bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-100";

                chip.className = `${colorClass} text-xs px-2 py-1.5 rounded border transition-colors shadow-sm text-left truncate max-w-full`;
                chip.textContent = m.label;
                chip.title = `Insérer {{${m.code || m.id}}}`; // Use code preferentially

                // Use code if available for insertion
                const macroCode = m.code || m.id;

                chip.addEventListener('click', () => insertMacro(macroCode));
                // Tooltip logic
                chip.addEventListener('mouseenter', (e) => showMacroTooltip(e.target, macroCode));
                chip.addEventListener('mouseleave', () => hideMacroTooltip());

                grid.appendChild(chip);
            });

            container.appendChild(grid);
        }

        // Initial render
        renderFilteredMacros(filterSelect ? filterSelect.value : orderedCategories[0]);
    }
    // Expose for external reload
    window.renderMacroList = renderMacroList;

    function insertMacro(macroId) {
        const tag = `{{${macroId}}}`;
        const start = inpContent.selectionStart;
        const end = inpContent.selectionEnd;
        const text = inpContent.value;

        inpContent.value = text.substring(0, start) + tag + text.substring(end);
        inpContent.focus();
        inpContent.selectionStart = inpContent.selectionEnd = start + tag.length;
    }

    // Initialize Synthesis Dropdown Integration
    updateSynthesisDropdown();

    // Initial Load of Lists
    await loadTemplatesList();
    renderMacroList();
}
window.initTemplateManager = initTemplateManager;

async function updateSynthesisDropdown() {
    const select = document.getElementById('summary-template-select');
    if (!select) return;

    try {
        const templates = await window.electronAPI.getTemplates();

        // Clear options immediately before rendering to avoid race conditions (duplicates)
        select.innerHTML = '<option value="" disabled selected>Choisir un modèle...</option>';

        if (templates.length > 0) {
            templates.forEach(t => {
                const opt = document.createElement('option');
                opt.value = `custom_${t.id}`;
                opt.textContent = t.name;
                select.appendChild(opt);
            });
        } else {
            select.innerHTML += '<option value="" disabled>Aucun modèle disponible</option>';
        }

    } catch (err) {
        console.error("Failed to load templates for dropdown", err);
        // Fallback if DB fails
        select.innerHTML = '<option value="" disabled selected>Erreur chargement</option>';
        select.innerHTML += `
            <option value="clinical">Résumé Clinique (Secours)</option>
        `;
    }
}

// --- LETTERS MODULE (COURRIERS REFACTOR) ---

let lettersModuleInitialized = false;

function initLettersModule() {
    // window.initLettersModule = initLettersModule; // Removed
    // Prevent double init listeners (though function is safe to call for reload)
    // Actually we want to reload lists every time we enter the tab? Or just once?
    // Let's reload lists on entry to ensure freshness.
    loadLetterTemplates();

    if (lettersModuleInitialized) return;
    lettersModuleInitialized = true;

    // Elements
    const btnCreate = document.getElementById('btn-create-perso-template');
    const btnCopy = document.getElementById('btn-copy-system-template');
    const btnSave = document.getElementById('btn-save-perso-template');
    const btnDelete = document.getElementById('btn-delete-perso-template');
    const btnPrint = document.getElementById('btn-print-letter');
    const editor = document.getElementById('letter-editor-content');

    // Macro Search & Filter
    const macroSearch = document.getElementById('macro-search-input');
    const macroFilter = document.getElementById('macro-category-filter-letter');

    // State
    window.currentLetterState = {
        id: null,
        isSystem: false,
        name: null,
        category: 'courrier'
    };

    // Actions
    btnCreate.addEventListener('click', () => setupLetterEditor(null, 'new'));

    btnCopy.addEventListener('click', () => {
        // Copy content, reset ID, set mode to Perso
        if (!editor.value) return;
        setupLetterEditor({
            content: editor.value,
            name: `Copie de ${window.currentLetterState.name || 'Modèle'}`,
            category: 'courrier'
        }, 'copy');
        showNotification("Modèle copié. Vous pouvez maintenant le modifier et l'enregistrer.");
    });

    btnSave.addEventListener('click', async () => {
        const content = editor.value;
        if (!content.trim()) return showNotification("Le contenu est vide.", 'error');

        let name = window.currentLetterState.name;

        // If new or copy, ask for name
        if (!window.currentLetterState.id) {
            name = prompt("Nom du nouveau modèle :", name || "");
            if (!name) return;
        }

        const data = {
            name: name,
            category: 'courrier', // Default to courrier for now, or add selector?
            content: content,
            is_system: 0
        };

        try {
            if (window.currentLetterState.id) {
                await window.electronAPI.updateTemplate(window.currentLetterState.id, data);
                showNotification("Modèle mis à jour.");
            } else {
                const res = await window.electronAPI.createTemplate(data);
                window.currentLetterState.id = res.id;
                showNotification("Nouveau modèle créé.");
            }
            window.currentLetterState.name = name;
            window.currentLetterState.isSystem = false;
            updateLetterEditorUI();
            loadLetterTemplates(); // Refresh lists
        } catch (e) {
            console.error(e);
            showNotification("Erreur lors de l'enregistrement.", 'error');
        }
    });

    btnDelete.addEventListener('click', async () => {
        if (!window.currentLetterState.id || window.currentLetterState.isSystem) return;
        if (!confirm("Supprimer ce modèle personnel ?")) return;

        try {
            await window.electronAPI.deleteTemplate(window.currentLetterState.id);
            showNotification("Modèle supprimé.");
            setupLetterEditor(null, 'new'); // Reset
            loadLetterTemplates();
        } catch (e) {
            console.error(e);
            showNotification("Erreur suppression.", 'error');
        }
    });

    btnPrint.addEventListener('click', () => {
        // Simple Print for now
        // Ideally render markdown/HTML first?
        // Using window.print() of the whole page is messy.
        // We probably want a print preview modal or a specific print window.
        // For now, let's use the existing print logic or just print the text? 
        // Existing print logic `printPreview` in renderer uses `print-container`. I can reuse that!
        // But `printPreview` expects `summaryData`.
        // Let's create a specific print helper for raw text.
        printLetterContent(editor.value);
    });

    // Macros
    initLetterMacros(macroSearch, macroFilter);
}
window.initLettersModule = initLettersModule;

async function loadLetterTemplates() {
    try {
        const templates = await window.electronAPI.getTemplates();
        const listSystem = document.getElementById('list-templates-system');
        const listPerso = document.getElementById('list-templates-perso');

        listSystem.innerHTML = "";
        listPerso.innerHTML = "";

        // Separate
        const systemTpls = templates.filter(t => t.is_system);
        const persoTpls = templates.filter(t => !t.is_system);

        // Render System
        if (systemTpls.length === 0) listSystem.innerHTML = `<div class="text-xs text-gray-400 italic px-2">Aucun modèle.</div>`;
        systemTpls.forEach(t => {
            const el = createTemplateItem(t);
            listSystem.appendChild(el);
        });

        // Render Perso
        if (persoTpls.length === 0) listPerso.innerHTML = `<div class="text-xs text-gray-400 italic px-2">Aucun modèle personnel.</div>`;
        persoTpls.forEach(t => {
            const el = createTemplateItem(t);
            listPerso.appendChild(el);
        });

    } catch (e) {
        console.error("Error loading templates", e);
    }
}

function createTemplateItem(t) {
    const div = document.createElement('div');
    div.className = "px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 cursor-pointer rounded border border-transparent hover:border-blue-100 transition-colors flex items-center justify-between group";
    div.innerHTML = `
        <span class="truncate">${t.name}</span>
        ${t.category === 'synthese' ? '<i class="fas fa-file-medical-alt text-gray-300 text-xs" title="Protocole"></i>' : ''}
    `;
    div.addEventListener('click', () => {
        setupLetterEditor(t, 'load');
    });
    return div;
}

function setupLetterEditor(templateData, mode) {
    const editor = document.getElementById('letter-editor-content');
    const title = document.getElementById('editor-template-title');
    const badge = document.getElementById('editor-template-badge');

    // default state
    let state = { id: null, isSystem: false, name: 'Nouveau Courrier', category: 'courrier' };
    let content = "";

    if (mode === 'load' && templateData) {
        state = { id: templateData.id, isSystem: !!templateData.is_system, name: templateData.name, category: templateData.category };
        content = templateData.content || "";
    } else if (mode === 'copy' && templateData) {
        state = { id: null, isSystem: false, name: templateData.name, category: templateData.category };
        content = templateData.content || "";
    } else if (mode === 'new') {
        // defaults
    }

    // Update Global State
    window.currentLetterState = state;

    // Update UI Content
    editor.value = content;
    title.textContent = state.name;

    // Badge
    badge.classList.remove('hidden', 'bg-purple-100', 'text-purple-700', 'bg-blue-100', 'text-blue-700', 'bg-gray-100', 'text-gray-600');
    if (state.isSystem) {
        badge.textContent = "Système";
        badge.classList.add('bg-purple-100', 'text-purple-700');
        badge.classList.remove('hidden');
        // Read Only Editor? No, allow edit for printing, just blocks saving.
        // Actually user might want to fill placeholders.
    } else if (state.id) {
        badge.textContent = "Perso";
        badge.classList.add('bg-blue-100', 'text-blue-700');
        badge.classList.remove('hidden');
    } else {
        badge.textContent = "Nouveau";
        badge.classList.add('bg-green-100', 'text-green-700');
        badge.classList.remove('hidden');
    }

    updateLetterEditorUI();
}

function updateLetterEditorUI() {
    const state = window.currentLetterState;
    const btnCopy = document.getElementById('btn-copy-system-template');
    const btnSave = document.getElementById('btn-save-perso-template');
    const btnDelete = document.getElementById('btn-delete-perso-template');

    if (state.isSystem) {
        btnCopy.classList.remove('hidden');
        btnSave.classList.add('hidden');
        btnDelete.classList.add('hidden');
    } else {
        btnCopy.classList.add('hidden');
        btnSave.classList.remove('hidden');
        if (state.id) {
            btnDelete.classList.remove('hidden');
        } else {
            btnDelete.classList.add('hidden');
        }
    }
}

// Reuse Macro list logic but adapted
function initLetterMacros(searchInput, filterSelect) {
    const container = document.getElementById('letters-macro-list');

    // Load Dropdown Options (Category) - Reuse definitions
    const orderedCategories = [
        "Identité", "Profil", "Biologie", "Date", "Examens", "Traitement", "Signature", "Autres", "Textes Médicaux", "Clinique", "Statut"
    ];

    filterSelect.innerHTML = '<option value="All">Toutes catégories</option>';
    orderedCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        filterSelect.appendChild(opt);
    });

    const render = () => {
        const macros = window.getAvailableMacros(); // from summary_engine
        if (!macros) return;

        const term = searchInput.value.toLowerCase();
        const catFilter = filterSelect.value;

        container.innerHTML = "";

        const filtered = macros.filter(m => {
            const matchesTerm = m.label.toLowerCase().includes(term) || m.code.toLowerCase().includes(term);
            const matchesCat = catFilter === 'All' || m.category === catFilter;
            return matchesTerm && matchesCat;
        });

        filtered.forEach(m => {
            const chip = document.createElement('button');
            let colorClass = "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100";
            // Reuse Badge Logic roughly? Or simpler chips for list
            if (m.type === 'text') colorClass = "bg-green-50 text-green-700 border-green-100 hover:bg-green-100";

            chip.className = `w-full text-left mb-1 ${colorClass} text-xs px-2 py-1.5 rounded border transition-colors shadow-sm flex justify-between items-center group`;
            chip.innerHTML = `<span>${m.label}</span> <span class="hidden group-hover:inline opacity-50 text-[10px]">{{${m.code}}}</span>`;
            chip.title = `Insérer {{${m.code}}}`;

            chip.addEventListener('click', () => {
                insertMacroIntoEditor(m.code);
            });
            // Tooltip
            chip.addEventListener('mouseenter', (e) => showMacroTooltip(e.target, m.code));
            chip.addEventListener('mouseleave', () => hideMacroTooltip());

            container.appendChild(chip);
        });
    };

    searchInput.addEventListener('input', render);
    filterSelect.addEventListener('change', render);

    // Initial
    render();
}

function insertMacroIntoEditor(code) {
    const editor = document.getElementById('letter-editor-content');
    const tag = `{{${code}}}`;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;

    editor.value = text.substring(0, start) + tag + text.substring(end);
    editor.focus();
    editor.selectionStart = editor.selectionEnd = start + tag.length;
}

function printLetterContent(content) {
    // Replace macros with dummy or real data before print?
    // Ideally we resolve macros first! 
    // Wait, the user wants the letter generated.
    let resolvedContent = content;
    try {
        if (currentPatient && window.resolveTemplate) {
            // We can use resolveTemplate from summary_engine if we exposed it, or just resolve macros manually
            resolvedContent = window.renderTemplate(content, currentPatient);
        }
    } catch (e) { console.error("Print resolution error", e); }

    // Format for print
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>Impression Courrier</title>
            <style>
                body { font-family: 'Times New Roman', serif; padding: 40px; line-height: 1.5; font-size: 12pt; }
                p { margin-bottom: 1em; }
                .header { margin-bottom: 40px; }
            </style>
        </head>
        <body>
            <div class="content whitespace-pre-line">${resolvedContent.replace(/\n/g, '<br>')}</div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}
// --- Macro Tooltip Helper Variables & Functions ---

let macroTooltip = null;

function showMacroTooltip(targetEl, macroId) {
    if (!macroTooltip) {
        macroTooltip = document.createElement('div');
        // Using Tailwind classes for styling
        macroTooltip.className = "fixed z-[9999] bg-slate-800 text-white border border-slate-700 shadow-xl rounded px-3 py-2 text-xs max-w-sm pointer-events-none transition-opacity duration-200 opacity-0 font-medium";
        document.body.appendChild(macroTooltip);
    }

    // Resolve Value using the global currentPatient
    let val = "Error";
    try {
        // window.resolveMacro is defined in summary_engine.js
        val = window.resolveMacro(macroId, currentPatient);
    } catch (e) {
        val = "Resolution Error";
        console.error(e);
    }

    if (val === undefined || val === null) val = "N/A";

    // Truncate if excessively long
    const maxLength = 300;
    const displayVal = val.toString().length > maxLength ? val.toString().substring(0, maxLength) + '...' : val;

    macroTooltip.innerHTML = `<div class="text-[10px] text-slate-400 uppercase mb-1 border-b border-slate-600 pb-1">Aperçu : {{${macroId}}}</div><div class="whitespace-pre-wrap">${displayVal}</div>`;

    // Position
    const rect = targetEl.getBoundingClientRect();
    const tooltipRect = macroTooltip.getBoundingClientRect();

    // Calculate position - default below
    let top = rect.bottom + 8;
    let left = rect.left;

    // Check bounds
    if (left + 300 > window.innerWidth) {
        left = window.innerWidth - 310;
    }

    // If running off bottom, put above
    if (top + 150 > window.innerHeight) {
        // Position above
        // We need to estimate height if not rendered yet, but pointer-events-none allows us to render it and measure?
        // It's opacity 0 but in DOM.
        // Let's just try to measure or guess.
        // Actually, since we appended it, we can measure it if we remove 'hidden' (which we didn't add, just opacity).
        // But getBoundingClientRect might work if it's in the DOM.
        const actualHeight = tooltipRect.height || 100;
        top = rect.top - actualHeight - 8;
    }

    macroTooltip.style.top = `${top}px`;
    macroTooltip.style.left = `${left}px`;

    // Show
    requestAnimationFrame(() => {
        macroTooltip.classList.remove('opacity-0');
    });
}

function hideMacroTooltip() {
    if (macroTooltip) {
        macroTooltip.classList.add('opacity-0');
    }
}

// --- Macro Manager UI ---

function openMacroManager() {
    // 1. Create Modal if not exists
    let modal = document.getElementById('modal-macro-manager');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-macro-manager';
        modal.className = "fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 hidden";
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col mx-4">
                <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <i class="fas fa-cubes text-purple-600"></i> Gestion des Macros
                    </h3>
                    <button id="btn-close-macro-manager" class="text-gray-400 hover:text-gray-600 transition-colors">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <div class="p-6 overflow-y-auto flex-1 bg-gray-50/50">
                    <div class="flex justify-between items-center mb-4">
                        <div class="text-sm text-gray-500">
                            Les macros "Valeur" récupèrent des données. Les macros "Texte" insèrent des phrases fixes.
                        </div>
                        <button id="btn-create-macro" class="hidden flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors text-sm font-medium shadow-sm">
                            <i class="fas fa-plus"></i> Nouvelle Macro (Bientôt)
                        </button>
                    </div>

                    <div class="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-gray-100/50 text-gray-500 font-semibold uppercase text-xs">
                                <tr>
                                    <th class="px-4 py-3 border-b border-gray-100">Macro ID</th>
                                    <th class="px-4 py-3 border-b border-gray-100">Étiquette</th>
                                    <th class="px-4 py-3 border-b border-gray-100">Catégorie</th>
                                    <th class="px-4 py-3 border-b border-gray-100">Type</th>
                                    <th class="px-4 py-3 border-b border-gray-100 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="macro-manager-list" class="divide-y divide-gray-100">
                                <!-- Populated by JS -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#btn-close-macro-manager').addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        // Close on esc
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        });
    }

    renderMacroManagerList();
    modal.classList.remove('hidden');
}

async function renderMacroManagerList() {
    const tbody = document.getElementById('macro-manager-list');
    if (!tbody) return;

    // Ensure fresh data
    await window.reloadMacros();

    let fullMacros = [];
    try {
        fullMacros = await window.electronAPI.getMacros();
    } catch (e) { console.error(e); }

    tbody.innerHTML = '';

    fullMacros.forEach(m => {
        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 transition-colors group";

        let typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">INCONNU</span>`;

        if (m.type === 'script') typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">SCRIPT</span>`;
        else if (m.type === 'quantitatif') typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-700 border border-teal-200">QUANT</span>`;
        else if (m.type === 'qualitatif') typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">QUAL</span>`;
        else if (m.type === 'text') typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-200">TEXTE</span>`;
        else if (m.type === 'value') typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">VALEUR</span>`;

        // Always allow editing now that we have a refactored system, 
        // OR check if it's a legacy script that can't be edited easily.
        // For now, allow all. The editor handles types.
        let actionBtn = `
            <button class="text-blue-600 hover:text-blue-800 p-1 transition-colors" onclick="editMacro('${m.id}')" title="Modifier">
                <i class="fas fa-edit"></i>
            </button>
        `;

        row.innerHTML = `
            <td class="px-4 py-3 font-mono text-xs text-gray-500">{{${m.code}}}</td>
            <td class="px-4 py-3 font-medium text-gray-800">${m.label}</td>
            <td class="px-4 py-3 text-gray-600">${m.category}</td>
            <td class="px-4 py-3">${typeBadge}</td>
            <td class="px-4 py-3 text-right">${actionBtn}</td>
        `;
        tbody.appendChild(row);
    });
}

window.editMacro = async (id) => {
    // Implement Edit Modal logic
    // We need to fetch the specific macro (or find in list)
    try {
        const macros = await window.electronAPI.getMacros();
        const macro = macros.find(m => m.id == id); // DB id is integer?
        if (macro) openMacroEditor(macro);
    } catch (e) { console.error(e); }
};


function openMacroEditor(macro) {
    // Create Editor Modal if not exists
    let modal = document.getElementById('modal-macro-editor');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-macro-editor';
        modal.className = "fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[60] hidden";
        modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
                    <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                        <h3 class="text-lg font-bold text-gray-800" id="macro-editor-title">Éditer Macro</h3>
                        <button id="btn-close-macro-editor" class="text-gray-400 hover:text-gray-600 transition-colors">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <div class="p-6 space-y-4 overflow-y-auto">
                        <input type="hidden" id="inp-macro-id">
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Code (Identifiant)</label>
                            <input type="text" id="inp-macro-code" disabled class="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded text-gray-500 font-mono text-sm">
                            <p class="text-xs text-gray-400 mt-1">L'identifiant unique ne peut pas être modifié.</p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Étiquette (Nom visible)</label>
                            <input type="text" id="inp-macro-label" class="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-purple-100 focus:border-purple-400 outline-none transition-all">
                        </div>

                        <!-- Type Selector (Only editable if not system?? actually user wanted to create macros so type might be selectable for new ones, but this is edit) -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Type de Macro</label>
                            <select id="inp-macro-type" class="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-purple-100 focus:border-purple-400 outline-none transition-all">
                                <option value="text">Texte Libre (Phrase fixe)</option>
                                <option value="quantitatif">Valeur Quantitative (Numérique)</option>
                                <option value="qualitatif">Valeur Qualitative (Oui/Non/Choix)</option>
                            </select>
                        </div>

                        <!-- Fields for 'text' type -->
                        <div id="field-macro-text" class="macro-field-group">
                            <label class="block text-sm font-medium text-gray-700 mb-1">Contenu du Texte</label>
                            <textarea id="inp-macro-template-text" rows="3" class="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-purple-100 focus:border-purple-400 outline-none transition-all resize-none"></textarea>
                            <p class="text-xs text-gray-400 mt-1">Ce texte remplacera le code {{...}} dans le document.</p>
                        </div>

                        <!-- Fields for 'value' types (Source Dropdown) -->
                        <div id="field-macro-source" class="macro-field-group hidden">
                            <label class="block text-sm font-medium text-gray-700 mb-1">Source de la Donnée</label>
                            <select id="inp-macro-source-select" class="w-full px-3 py-2 border border-gray-200 rounded focus:ring-2 focus:ring-purple-100 focus:border-purple-400 outline-none transition-all">
                                <!-- Populated from Dictionary -->
                            </select>
                            <p class="text-xs text-gray-400 mt-1">Sélectionnez la donnée patient à afficher.</p>
                        </div>

                    </div>
                    <div class="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                        <button id="btn-cancel-macro" class="px-4 py-2 text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm">Annuler</button>
                        <button id="btn-save-macro" class="px-4 py-2 text-white bg-purple-600 hover:bg-purple-700 rounded shadow-sm font-medium">Enregistrer</button>
                    </div>
                </div>
            `;
        document.body.appendChild(modal);

        // Populate Source Dropdown
        const sourceSelect = document.getElementById('inp-macro-source-select');
        const sources = window.getMacroSources();

        // 1. Group by Category
        const groupedSources = sources.reduce((acc, src) => {
            const cat = src.category || 'Autres';
            acc[cat] = acc[cat] || [];
            acc[cat].push(src);
            return acc;
        }, {});

        // 2. Define Order (Same as Sidebar)
        const displayOrder = [
            "Identité",
            "Profil",
            "Biologie",
            "Date",
            "Examens",
            "Traitement",
            "Signature",
            "Autres",
            "Textes Médicaux",
            "Clinique",
            "Statut"
        ];

        // 3. Populate Select with Optgroups in Order
        sourceSelect.innerHTML = "";

        displayOrder.forEach(cat => {
            if (groupedSources[cat]) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = cat;

                groupedSources[cat].forEach(src => {
                    const opt = document.createElement('option');
                    opt.value = src.id;
                    opt.textContent = src.label;
                    optgroup.appendChild(opt);
                });

                sourceSelect.appendChild(optgroup);
            }
        });

        // 4. Handle any remaining categories not in displayOrder
        Object.keys(groupedSources).forEach(cat => {
            if (!displayOrder.includes(cat)) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = cat;
                groupedSources[cat].forEach(src => {
                    const opt = document.createElement('option');
                    opt.value = src.id;
                    opt.textContent = src.label;
                    optgroup.appendChild(opt);
                });
                sourceSelect.appendChild(optgroup);
            }
        });

        // Handlers
        const typeSelect = document.getElementById('inp-macro-type');
        typeSelect.addEventListener('change', () => {
            const val = typeSelect.value;
            document.getElementById('field-macro-text').classList.toggle('hidden', val !== 'text');
            document.getElementById('field-macro-source').classList.toggle('hidden', val === 'text');
        });

        const close = () => modal.classList.add('hidden');
        modal.querySelector('#btn-close-macro-editor').addEventListener('click', close);
        modal.querySelector('#btn-cancel-macro').addEventListener('click', close);

        modal.querySelector('#btn-save-macro').addEventListener('click', async () => {
            const id = document.getElementById('inp-macro-id').value;
            const label = document.getElementById('inp-macro-label').value;
            const type = document.getElementById('inp-macro-type').value;

            const tplText = document.getElementById('inp-macro-template-text').value;
            const sourcePath = document.getElementById('inp-macro-source-select').value;

            // stash for hidden fields retention
            const originalJson = document.getElementById('inp-macro-original')?.value;
            if (!originalJson) return;
            const original = JSON.parse(originalJson);

            const finalData = {
                ...original,
                label: label,
                type: type, // Now we update type!
                // If type is text, save text, clear path? Or keep path as backup? 
                // Cleaner to sync properly.
                template_text: (type === 'text') ? tplText : null,
                value_path: (type !== 'text') ? sourcePath : null
            };

            try {
                await window.electronAPI.updateMacro(id, finalData);
                close();
                renderMacroManagerList();
                await window.reloadMacros();
            } catch (e) {
                console.error("Failed to save macro", e);
                alert("Erreur lors de l'enregistrement");
            }
        });
    }

    // Populate
    document.getElementById('inp-macro-id').value = macro.id;
    document.getElementById('inp-macro-code').value = macro.code;
    document.getElementById('inp-macro-label').value = macro.label;

    // Map old types to new types if needed
    let typeVal = macro.type;
    if (typeVal === 'value') typeVal = 'quantitatif'; // default mapping for legacy
    if (typeVal === 'script') typeVal = 'text'; // Script macros shouldn't really be edited here but handled as read-only or special?
    // Actually, if it's a script like 'risk_score', we probably shouldn't let them change it to a simple value unless they want to override the logic.
    // For now, let's respect the type if it matches our options, else default to text?

    const typeSelect = document.getElementById('inp-macro-type');
    // Check if option exists
    if (![...typeSelect.options].some(o => o.value === typeVal)) {
        // If it's a script/system macro, maybe lock the type?
        // For this refactor, let's assume valid types.
        // But 'script' types from seed are tricky. 
        // If the user wants to EDIT a script macro, they are likely converting it to a custom text.
        // Let's force 'text' if unknown?
    }
    typeSelect.value = typeVal;

    // Trigger change to show correct fields
    typeSelect.dispatchEvent(new Event('change'));

    // Values
    if (macro.template_text) document.getElementById('inp-macro-template-text').value = macro.template_text;
    if (macro.value_path) document.getElementById('inp-macro-source-select').value = macro.value_path;

    // Store original
    let stash = document.getElementById('inp-macro-original');
    if (!stash) {
        stash = document.createElement('input');
        stash.type = 'hidden';
        stash.id = 'inp-macro-original';
        document.getElementById('modal-macro-editor').querySelector('.p-6').appendChild(stash);
    }
    stash.value = JSON.stringify(macro);

    document.getElementById('modal-macro-editor').classList.remove('hidden');
}

// Global expose
window.openMacroManager = openMacroManager;


// Auto-init on load
document.addEventListener('DOMContentLoaded', async () => {
    if (window.reloadMacros) {
        await window.reloadMacros();
    }
    if (window.initTemplateManager) {
        window.initTemplateManager();
    }
});
