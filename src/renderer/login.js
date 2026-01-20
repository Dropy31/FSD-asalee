// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const form = document.getElementById('auth-form');
    const pwdInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm-password');
    const confirmContainer = document.getElementById('confirm-container');
    const errorMsg = document.getElementById('error-msg');
    const btnSubmit = document.getElementById('btn-submit');
    const btnText = document.getElementById('btn-text');
    const pageTitle = document.getElementById('page-title');
    const pageDesc = document.getElementById('page-desc');

    // Reset Modal Elements
    const btnReset = document.getElementById('btn-reset');
    const resetModal = document.getElementById('reset-modal');
    const btnCancelReset = document.getElementById('cancel-reset');
    const btnConfirmReset = document.getElementById('confirm-reset');

    let mode = 'login'; // login, register, migrate

    /* --- INIT LOGIC --- */

    // Check Auth Status ONLY if API is available
    // Use window.electronAPI as defined in preload.js
    const api = window.electronAPI;

    if (api) {
        api.getAuthStatus()
            .then(status => {
                console.log('Auth Status:', status);

                if (status.status === 'registered') {
                    mode = 'login';
                    pageTitle.textContent = 'Connexion';
                    pageDesc.textContent = 'Déchiffrement de la base de données locale.';
                    btnText.textContent = 'Déverrouiller';
                } else {
                    // Register or Migrate
                    mode = status.status === 'migration_needed' ? 'migrate' : 'register';
                    confirmContainer.classList.remove('hidden');
                    confirmInput.setAttribute('required', 'true');

                    if (mode === 'migrate') {
                        pageTitle.textContent = 'Sécurisation Requise';
                        pageDesc.textContent = 'Une mise à jour de sécurité nécessite la définition d\'un mot de passe pour protéger vos données existantes.';
                        btnText.textContent = 'Chiffrer et Démarrer';
                    } else {
                        pageTitle.textContent = 'Bienvenue';
                        pageDesc.textContent = 'Veuillez définir un mot de passe maître pour sécuriser vos données.';
                        btnText.textContent = 'Créer le coffre-fort';
                    }
                }
            })
            .catch(err => {
                console.error('Failed to get auth status:', err);
                showError('Erreur de communication avec le processus main.');
            });
    } else {
        console.error('window.electronAPI is not defined');
        showError('Erreur critique: API non disponible.');
    }

    /* --- EVENT LISTENERS --- */

    // 1. Password Visibility
    if (document.getElementById('toggle-pwd')) {
        document.getElementById('toggle-pwd').addEventListener('click', () => {
            const type = pwdInput.type === 'password' ? 'text' : 'password';
            pwdInput.type = type;
            confirmInput.type = type;
        });
    }

    // 2. Form Submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pwd = pwdInput.value;

            errorMsg.classList.add('hidden');
            errorMsg.textContent = '';

            if ((mode === 'register' || mode === 'migrate') && pwd !== confirmInput.value) {
                showError('Les mots de passe ne correspondent pas.');
                return;
            }

            if (pwd.length < 4) {
                showError('Le mot de passe est trop court.');
                return;
            }

            setLoading(true);

            try {
                let success = false;
                if (!api) throw new Error('API unavailable');

                if (mode === 'login') {
                    success = await api.login(pwd);
                } else if (mode === 'register') {
                    success = await api.register(pwd);
                } else if (mode === 'migrate') {
                    success = await api.migrate(pwd);
                }

                if (!success) {
                    showError('Échec de l\'opération.');
                    setLoading(false);
                }
                // If success, window closes or redirects automatically via main process
            } catch (err) {
                console.error(err);
                showError(err.message || 'Une erreur est survenue.');
                setLoading(false);
            }
        });
    }

    // 3. Reset Functionality (Listeners attached INDEPENDENTLY of init)
    if (btnReset && resetModal) {
        // Open
        btnReset.addEventListener('click', (e) => {
            e.preventDefault();
            resetModal.classList.remove('hidden');
        });

        // Close (Cancel)
        if (btnCancelReset) {
            btnCancelReset.addEventListener('click', () => {
                resetModal.classList.add('hidden');
            });
        }

        // Close (Outside)
        resetModal.addEventListener('click', (e) => {
            if (e.target === resetModal) {
                resetModal.classList.add('hidden');
            }
        });

        // Confirm Reset
        if (btnConfirmReset) {
            btnConfirmReset.addEventListener('click', async () => {
                resetModal.classList.add('hidden'); // Close first
                setLoading(true);
                btnText.textContent = 'Réinitialisation...';

                try {
                    console.log('Attempting reset via custom modal...');
                    if (!api) throw new Error('API unavailable');

                    const success = await api.reset();
                    console.log('Reset result:', success);

                    if (success) {
                        window.location.reload();
                    } else {
                        showError('Fichier de configuration introuvable.');
                        setLoading(false);
                    }
                } catch (error) {
                    console.error('Reset failed:', error);
                    showError('Erreur: ' + error.message);
                    setLoading(false);
                }
            });
        }
    } else {
        console.warn('Reset button or modal not found in DOM');
    }

    /* --- HELPERS --- */

    function showError(msg) {
        if (!errorMsg) return;
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');

        if (form) {
            form.classList.add('animate-pulse');
            setTimeout(() => form.classList.remove('animate-pulse'), 500);
        }
    }

    function setLoading(isLoading) {
        if (btnSubmit) btnSubmit.disabled = isLoading;
        if (btnText) {
            if (isLoading) {
                btnText.textContent = 'Traitement...';
            } else {
                btnText.textContent = mode === 'login' ? 'Déverrouiller' : 'Enregistrer';
            }
        }
    }

});
