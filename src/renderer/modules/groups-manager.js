
// Groups Manager Module

export const groupsManager = {
    groups: [],
    currentGroupId: null,

    init() {
        console.log('Groups Manager Initialized');
        this.renderGroupsList([]); // Initial empty state
        this.setupSearchListeners();
    },

    // --- CRUD Operations ---

    async loadGroups() {
        try {
            const groups = await window.electronAPI.dbGetGroups();
            this.groups = groups;
            this.renderGroupsList(groups);
        } catch (err) {
            console.error('Failed to load groups:', err);
            showNotification('Erreur chargement groupes', 'error');
        }
    },

    async saveGroup() {
        const id = document.getElementById('group-id').value;
        const name = document.getElementById('inp-group-name').value.trim();
        const desc = document.getElementById('inp-group-desc').value.trim();
        const protocol = document.getElementById('inp-group-protocol').value;

        if (!name) {
            highlightError('inp-group-name');
            return;
        }

        const data = {
            name,
            description: desc,
            protocol: protocol || null,
            etp_session_id: null
        };

        try {
            if (id) {
                await window.electronAPI.dbUpdateGroup(parseInt(id), data);
                showNotification('Groupe mis à jour');
            } else {
                await window.electronAPI.dbCreateGroup(data);
                showNotification('Groupe créé avec succès');
            }
            this.closeModal();
            this.loadGroups();
        } catch (err) {
            console.error('Save Group Error:', err);
            showNotification(err.message, 'error');
        }
    },

    async deleteGroup(id) {
        if (!confirm('Voulez-vous vraiment supprimer ce groupe ? Les patients ne seront pas supprimés.')) return;
        try {
            await window.electronAPI.dbDeleteGroup(id);
            showNotification('Groupe supprimé');
            this.loadGroups();
        } catch (err) {
            console.error(err);
            showNotification('Erreur suppression', 'error');
        }
    },

    // --- Member Management ---

    async openDetails(id) {
        this.currentGroupId = id;
        const group = this.groups.find(g => g.id === id);
        if (!group) return;

        document.getElementById('details-group-name').textContent = group.name;

        // Load Members
        await this.loadMembers();

        document.getElementById('modal-group-details').classList.remove('hidden');
    },

    async loadMembers() {
        if (!this.currentGroupId) return;
        try {
            const patients = await window.electronAPI.dbGetGroupPatients(this.currentGroupId);
            this.renderMembers(patients);

            // Update Count in Header
            const countEl = document.getElementById('details-group-count');
            countEl.innerHTML = `<i class="fas fa-users mr-1"></i> ${patients.length}/8`;
            if (patients.length >= 8) countEl.classList.add('text-red-400');
            else countEl.classList.remove('text-red-400');

        } catch (err) {
            console.error('Error loading members:', err);
        }
    },

    async addPatient(patientId) {
        if (!this.currentGroupId) return;
        try {
            await window.electronAPI.dbAddPatientToGroup(this.currentGroupId, patientId);
            showNotification('Patient ajouté');
            this.loadMembers(); // Refresh list and count
            this.loadGroups(); // Refresh main card count

            // Clear search
            const searchInput = document.getElementById('inp-search-db');
            if (searchInput) searchInput.value = '';

            const resultsContainer = document.getElementById('db-patients-list');
            if (resultsContainer) {
                resultsContainer.innerHTML = '';
                resultsContainer.classList.add('hidden');
            }
        } catch (err) {
            // Already handled by main.js error throwing (e.g. max limit or duplicate)
            showNotification(err.message, 'error');
        }
    },

    async removePatient(patientId) {
        if (!this.currentGroupId) return;
        if (!confirm('Retirer ce patient du groupe ?')) return;

        try {
            await window.electronAPI.dbRemovePatientFromGroup(this.currentGroupId, patientId);
            showNotification('Patient retiré');
            this.loadMembers();
            this.loadGroups();
        } catch (err) {
            console.error(err);
            showNotification('Erreur lors du retrait', 'error');
        }
    },

    // --- Search Logic ---

    setupSearchListeners() {
        const dbSearch = document.getElementById('inp-search-db');
        if (dbSearch) {
            dbSearch.addEventListener('input', debounce((e) => this.searchDbPatients(e.target.value), 300));
        }
    },

    async searchDbPatients(query) {
        const container = document.getElementById('db-patients-list');
        if (!query || query.length < 2) {
            container.innerHTML = '';
            container.classList.add('hidden'); // Hide if empty
            return;
        }

        try {
            // We fetch ALL and filter client side for now
            const allPatients = await window.electronAPI.getPatients();
            const q = query.toLowerCase();
            const matches = allPatients.filter(p =>
                (p.lastName && p.lastName.toLowerCase().includes(q)) ||
                (p.firstName && p.firstName.toLowerCase().includes(q))
            ).slice(0, 10); // Limit to 10 for dropdown

            if (matches.length > 0) {
                container.innerHTML = matches.map(p => `
                    <div onclick="groupsManager.addPatient(${p.db_id})" 
                         class="p-4 hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-100 last:border-0 flex justify-between items-center group">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                ${p.firstName.charAt(0)}${p.lastName.charAt(0)}
                            </div>
                            <div>
                                <div class="font-bold text-gray-800 text-sm">${p.lastName.toUpperCase()} ${p.firstName}</div>
                                <div class="text-xs text-gray-400">Né(e) le ${p.birthDate || '--'}</div>
                            </div>
                        </div>
                        <div class="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium text-sm">
                            Ajouter <i class="fas fa-plus ml-1"></i>
                        </div>
                    </div>
                `).join('');
                container.classList.remove('hidden'); // Show results
            } else {
                container.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">Aucun patient trouvé.</div>';
                container.classList.remove('hidden'); // Show "No results" message
            }

        } catch (err) {
            console.error('Search error:', err);
        }
    },

    // --- UI Helpers ---

    openCreateModal() {
        document.getElementById('group-id').value = '';
        document.getElementById('inp-group-name').value = '';
        document.getElementById('inp-group-desc').value = '';
        document.getElementById('inp-group-protocol').value = '';
        document.getElementById('modal-group-title').textContent = 'Nouveau Groupe';
        document.getElementById('modal-group').classList.remove('hidden');
    },

    async openEditModal(id) {
        const group = this.groups.find(g => g.id === id);
        if (!group) return;

        document.getElementById('group-id').value = group.id;
        document.getElementById('inp-group-name').value = group.name;
        document.getElementById('inp-group-desc').value = group.description || '';
        document.getElementById('modal-group-title').textContent = 'Modifier Groupe';
        document.getElementById('modal-group').classList.remove('hidden');

        document.getElementById('inp-group-protocol').value = group.protocol || '';
    },

    closeModal() {
        document.getElementById('modal-group').classList.add('hidden');
    },

    closeDetails() {
        document.getElementById('modal-group-details').classList.add('hidden');
        this.currentGroupId = null;
    },

    async loadEtpOptions() {
        const select = document.getElementById('inp-group-etp');
        try {
            const sessions = await window.electronAPI.dbGetSessions(); // From ETP Library
            select.innerHTML = '<option value="">-- Aucune --</option>' +
                sessions.map(s => `<option value="${s.id}">${s.title} (${s.category})</option>`).join('');
        } catch (err) {
            console.error('Error loading ETP sessions:', err);
        }
    },

    renderGroupsList(groups) {
        const container = document.getElementById('groups-list-container');
        const empty = document.getElementById('groups-empty-state');

        if (groups.length === 0) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        const protocolKey = {
            'diabete': { label: 'Diabète', color: 'bg-blue-100 text-blue-700' },
            'respiratoire': { label: 'Respiratoire', color: 'bg-teal-100 text-teal-700' },
            'cognitif': { label: 'Cognitif', color: 'bg-purple-100 text-purple-700' },
            'autres': { label: 'Autres', color: 'bg-slate-100 text-slate-700' }
        };

        empty.classList.add('hidden');
        container.innerHTML = groups.map(g => {
            const proto = g.protocol ? protocolKey[g.protocol] : null;
            return `
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                <div class="p-5 flex-1">
                    <div class="flex justify-between items-start mb-2">
                        <div class="overflow-hidden">
                            <h3 class="font-bold text-lg text-slate-800 truncate" title="${g.name}">${g.name}</h3>
                            ${proto ? `<span class="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${proto.color}">${proto.label}</span>` : ''}
                        </div>
                        <div class="flex gap-2 shrink-0 ml-2">
                            <button onclick="groupsManager.openEditModal(${g.id})" class="text-slate-400 hover:text-blue-500" title="Modifier">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="groupsManager.deleteGroup(${g.id})" class="text-slate-400 hover:text-red-500" title="Supprimer">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                    <p class="text-sm text-slate-500 line-clamp-2 mb-4 h-10">${g.description || 'Aucune description'}</p>
                    
                    <div class="flex items-center justify-between text-sm mt-auto">
                        <div class="flex items-center gap-2 ${g.member_count >= 8 ? 'text-red-500 font-bold' : 'text-slate-600'}">
                            <i class="fas fa-users"></i>
                            <span>${g.member_count}/8</span>
                        </div>
                    </div>
                </div>
                <!-- Action Footer -->
                <div class="border-t border-slate-100 flex divide-x divide-slate-100">
                    <button onclick="groupsManager.openDetails(${g.id})" 
                        class="flex-1 py-3 bg-slate-50 btn-hover-green text-slate-600 font-medium text-xs transition-colors flex items-center justify-center gap-2" title="Gérer les patients du groupe">
                        <i class="fas fa-users-cog"></i> Gérer les membres
                    </button>
                    <button onclick="groupsManager.openSessionModal(${g.id})" 
                        class="flex-1 py-3 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 font-medium text-xs transition-colors flex items-center justify-center gap-2" title="Planifier une séance ETP pour ce groupe">
                        <i class="fas fa-calendar-plus"></i> Ajouter une séance
                    </button>
                </div>
            </div>
            `;
        }).join('');
    },

    renderMembers(patients) {
        const container = document.getElementById('group-members-list');
        if (patients.length === 0) {
            container.innerHTML = '<div class="text-center text-slate-400 mt-10">Aucun membre.<br>Ajoutez-en depuis la droite.</div>';
            return;
        }

        container.innerHTML = patients.map(p => `
            <div class="flex justify-between items-center group p-3 bg-white border border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all">
                <div class="flex flex-col">
                    <div class="font-bold text-gray-900 text-sm leading-tight">${p.lastName.toUpperCase()} ${p.firstName}</div>
                    <div class="text-xs text-gray-500 mt-1"><i class="far fa-calendar-alt mr-1"></i> Ajouté le ${p.added_at ? new Date(p.added_at).toLocaleDateString() : '--'}</div>
                </div>
                <button onclick="groupsManager.removePatient(${p.db_id})" 
                    class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Retirer du groupe">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `).join('');
    },

    // --- Session Scheduling ---
    allSessions: [],

    async openSessionModal(groupId) {
        this.currentGroupId = groupId;
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return;

        // Reset text
        document.getElementById('modal-group-session').classList.remove('hidden');

        // Pre-fill Protocol Filter
        const protocolSelect = document.getElementById('sel-session-filter-protocol');
        if (group.protocol) {
            protocolSelect.value = group.protocol;
        } else {
            protocolSelect.value = "";
        }

        // Reset other filters
        document.getElementById('sel-session-filter-category').value = "";
        document.getElementById('chk-session-filter-collective').checked = true;

        await this.loadAllSessions();
    },

    closeSessionModal() {
        document.getElementById('modal-group-session').classList.add('hidden');
    },

    async loadAllSessions() {
        try {
            this.allSessions = await window.electronAPI.dbGetAllSessions();
            this.populateCategoryFilter();
            this.filterSessions();
        } catch (err) {
            console.error(err);
            showNotification("Erreur chargement bibliothèque", "error");
        }
    },

    populateCategoryFilter() {
        if (!this.allSessions) return;
        const categories = [...new Set(this.allSessions.map(s => s.category))].filter(Boolean).sort();
        const select = document.getElementById('sel-session-filter-category');
        select.innerHTML = '<option value="">Toutes compétences</option>';
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            select.appendChild(opt);
        });
    },

    filterSessions() {
        const protocol = document.getElementById('sel-session-filter-protocol').value;
        const category = document.getElementById('sel-session-filter-category').value;
        const onlyCollective = document.getElementById('chk-session-filter-collective').checked;

        let filtered = this.allSessions || [];

        if (protocol) {
            // Loose matching or exact? Protocol in DB is single value.
            filtered = filtered.filter(s => s.protocol === protocol);
        }
        if (category) {
            filtered = filtered.filter(s => s.category === category);
        }
        if (onlyCollective) {
            filtered = filtered.filter(s => s.mode && s.mode.toLowerCase().includes('collectif'));
        }

        this.renderSessionsList(filtered);
    },

    renderSessionsList(sessions) {
        const container = document.getElementById('list-group-sessions');
        if (sessions.length === 0) {
            container.innerHTML = '<div class="text-xs text-gray-500 text-center py-4">Aucune séance trouvée dans la bibliothèque.</div>';
            return;
        }

        container.innerHTML = sessions.map(s => `
            <div class="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-all flex items-center justify-between">
                <div>
                    <div class="font-bold text-gray-800 text-sm">${s.title}</div>
                    <div class="text-xs text-gray-500 mt-1 flex gap-2">
                        <span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">${s.category}</span>
                        <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">${s.mode || 'N/A'}</span>
                        ${s.protocol ? `<span class="bg-purple-50 text-purple-600 px-2 py-0.5 rounded uppercase text-[10px] tracking-wider">${s.protocol}</span>` : ''}
                    </div>
                </div>
                <button onclick="groupsManager.selectSession(${s.id})" class="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
                    Choisir
                </button>
            </div>
        `).join('');
    },

    async selectSession(sessionId) {
        try {
            const group = this.groups.find(g => g.id === this.currentGroupId);
            if (!group) return;

            const data = {
                name: group.name,
                description: group.description,
                etp_session_id: sessionId
            };

            await window.electronAPI.dbUpdateGroup(this.currentGroupId, data);

            showNotification('Séance programmée');
            this.closeSessionModal();
            this.loadGroups();
        } catch (err) {
            console.error(err);
            showNotification("Erreur sauvegarde", "error");
        }
    }
};

// Utils
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Expose to window for onclick handlers
window.groupsManager = groupsManager;
