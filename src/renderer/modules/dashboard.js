
// calculateAge implementation internal to dashboard for now
// Inspect helper functions in renderer.js first.

import { patientManager } from './patient-manager.js';

let openPatientCallback = null;
let closePatientCallback = null;

export const dashboard = {
    init(openHandler, closeHandler) {
        openPatientCallback = openHandler;
        closePatientCallback = closeHandler;

        // Setup Search Listener
        const searchInput = document.getElementById('dashboard-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }

        // Setup Sort Listener
        const sortBtn = document.getElementById('sort-name');
        if (sortBtn) {
            sortBtn.addEventListener('click', () => this.handleSort());
        }
    },

    async refresh() {
        try {
            console.log('Dashboard: Refreshing data...');
            const patients = await patientManager.getAll();
            this.renderAll(patients);
            this.renderRecent(patients);
        } catch (error) {
            console.error('Dashboard: Error refreshing', error);
        }
    },

    renderRecent(patients) {
        const tbody = document.getElementById('table-recent-patients');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Sort by last_viewed_at desc
        const recent = [...patients].sort((a, b) => {
            const dateA = new Date(a.last_viewed_at || a.updated_at || 0);
            const dateB = new Date(b.last_viewed_at || b.updated_at || 0);
            return dateB - dateA;
        }).slice(0, 5);

        if (recent.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-400 italic">Aucun patient consulté récemment.</td></tr>`;
            return;
        }

        recent.forEach(p => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors cursor-pointer';
            row.innerHTML = `
                <td class="px-3 py-2 font-medium text-gray-900 text-sm">${p.lastName}</td>
                <td class="px-3 py-2 text-gray-600 text-sm">${p.firstName}</td>
                <td class="px-3 py-2 text-gray-500 text-sm">${p.birthDate ? this._calculateAge(p.birthDate) + ' ans' : '-'}</td>
                <td class="px-3 py-2 text-gray-500 text-sm">${p.gp || '-'}</td>
                <td class="px-3 py-2 text-gray-500 text-sm">${this._renderProtocolBadges(p.protocols)}</td>
                <td class="px-3 py-2 text-gray-500 text-sm">${p.last_viewed_at ? new Date(p.last_viewed_at).toLocaleDateString() : (p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '-')}</td>
                <td class="px-3 py-2 text-right flex justify-end gap-2">
                     <button class="text-blue-600 hover:text-blue-800 transition-colors p-1 btn-open" title="Ouvrir le dossier" data-id="${p.db_id}">
                        <i class="fas fa-folder-open fa-lg"></i>
                     </button>
                     <button class="text-gray-500 hover:text-blue-600 transition-colors p-1 btn-edit" title="Éditer Identité & Protocoles" data-id="${p.db_id}">
                        <i class="fas fa-pen fa-lg"></i>
                     </button>
                     <button class="text-red-400 hover:text-red-600 transition-colors p-1 btn-delete" title="Supprimer" data-id="${p.db_id}">
                        <i class="fas fa-trash-alt fa-lg"></i>
                     </button>
                </td>
             `;

            // Row click to open
            row.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    if (openPatientCallback) openPatientCallback(p.db_id);
                }
            });
            // Button click
            // Button clicks
            const btnOpen = row.querySelector('.btn-open');
            if (btnOpen) btnOpen.addEventListener('click', (e) => {
                e.stopPropagation();
                if (openPatientCallback) openPatientCallback(p.db_id);
            });

            const btnEdit = row.querySelector('.btn-edit');
            if (btnEdit) btnEdit.addEventListener('click', (e) => {
                e.stopPropagation();
                // Edit navigates to the same "open" state but we might want to ensure it lands on Identity
                // Since openPatientCallback typically opens default view (which is user defined or Identity), 
                // we can just use openPatientCallback for now as requested "bring to identité et protocole"
                // The current renderer implementation: openPatientHandler switches to "Identity & Protocols" by default
                if (openPatientCallback) openPatientCallback(p.db_id);
            });

            const btnDelete = row.querySelector('.btn-delete');
            if (btnDelete) btnDelete.addEventListener('click', (e) => this._handleDelete(e, p));

            tbody.appendChild(row);
        });
    },

    renderAll(patients) {
        const tbody = document.getElementById('table-all-patients');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (patients.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">Aucun patient trouvé.</td></tr>`;
            return;
        }

        patients.forEach(p => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-3 py-2 font-medium text-gray-900 text-sm">${p.lastName || ''}</td>
                <td class="px-3 py-2 text-gray-600 text-sm">${p.firstName || ''}</td>
                <td class="px-3 py-2 text-gray-500 text-sm">${p.birthDate ? this._calculateAge(p.birthDate) + ' ans' : '-'}</td>
                <td class="px-3 py-2 text-gray-500 text-sm">${p.gp || '-'}</td>
                <td class="px-3 py-2 text-gray-500 text-sm">${this._renderProtocolBadges(p.protocols)}</td>
                <td class="px-3 py-2 text-gray-500 text-sm">${p.last_viewed_at ? new Date(p.last_viewed_at).toLocaleDateString() : (p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '-')}</td>
                <td class="px-3 py-2 text-right flex justify-end gap-2"></td>
            `;

            const actionCell = row.querySelector('td:last-child');

            // Open Button
            const btnOpen = document.createElement('button');
            btnOpen.className = 'text-blue-600 hover:text-blue-800 transition-colors p-1';
            btnOpen.innerHTML = '<i class="fas fa-folder-open fa-lg"></i>';
            btnOpen.title = 'Ouvrir';
            btnOpen.addEventListener('click', (e) => {
                e.stopPropagation();
                if (openPatientCallback) openPatientCallback(p.db_id);
            });
            actionCell.appendChild(btnOpen);

            // Edit Button
            const btnEdit = document.createElement('button');
            btnEdit.className = 'text-gray-500 hover:text-blue-600 transition-colors p-1';
            btnEdit.innerHTML = '<i class="fas fa-pen fa-lg"></i>';
            btnEdit.title = 'Éditer';
            btnEdit.addEventListener('click', (e) => {
                e.stopPropagation();
                if (openPatientCallback) openPatientCallback(p.db_id);
            });
            actionCell.appendChild(btnEdit);

            // Delete Button
            const btnDelete = document.createElement('button');
            btnDelete.className = 'text-red-400 hover:text-red-600 transition-colors p-1';
            btnDelete.innerHTML = '<i class="fas fa-trash-alt fa-lg"></i>';
            btnDelete.title = 'Supprimer';
            btnDelete.addEventListener('click', (e) => this._handleDelete(e, p));
            actionCell.appendChild(btnDelete);

            tbody.appendChild(row);
        });
    },

    async _handleDelete(e, patient) {
        e.stopPropagation();
        if (confirm(`Êtes-vous sûr de vouloir supprimer le dossier de ${patient.lastName} ${patient.firstName} ?`)) {
            try {
                if (patientManager.isActive(patient.db_id)) {
                    if (closePatientCallback) closePatientCallback();
                }
                await patientManager.delete(patient.db_id);
                this.refresh();
                if (window.showNotification) window.showNotification('Dossier supprimé', 'success');
            } catch (err) {
                console.error('Error deleting:', err);
                alert('Erreur lors de la suppression');
            }
        }
    },

    handleSearch(term) {
        term = term.toLowerCase();
        patientManager.getAll().then(all => {
            const filtered = all.filter(p =>
                (p.lastName && p.lastName.toLowerCase().includes(term)) ||
                (p.firstName && p.firstName.toLowerCase().includes(term))
            );
            this.renderAll(filtered);
        });
    },

    _sortDirection: 'asc',
    handleSort() {
        this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
        const btn = document.getElementById('sort-name');
        if (btn) btn.innerHTML = `Nom <i class="fas fa-sort-${this._sortDirection === 'asc' ? 'alpha-down' : 'alpha-up'} ml-1"></i>`;

        patientManager.getAll().then(all => {
            const sorted = [...all].sort((a, b) => {
                const nameA = (a.lastName || '').toLowerCase();
                const nameB = (b.lastName || '').toLowerCase();
                if (nameA < nameB) return this._sortDirection === 'asc' ? -1 : 1;
                if (nameA > nameB) return this._sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
            this.renderAll(sorted);
        });
    },

    _calculateAge(dateStr) {
        if (!dateStr) return '';
        const dob = new Date(dateStr);
        const diff = Date.now() - dob.getTime();
        const ageDate = new Date(diff);
        return Math.abs(ageDate.getUTCFullYear() - 1970);
    },

    _renderProtocolBadges(protocols) {
        if (!protocols) return '';

        // Definitions matching renderer.js logic
        const definitions = [
            { key: 'dt2', label: 'DT2', color: 'bg-green-100 text-green-800' },
            { key: 'rcva', label: 'RCVA', color: 'bg-red-100 text-red-800' },
            { key: 'smoke', label: 'BAT', color: 'bg-blue-100 text-blue-800' },
            { key: 'asthme', label: 'BAT', color: 'bg-blue-100 text-blue-800' },
            { key: 'bpco', label: 'BAT', color: 'bg-blue-100 text-blue-800' },
            { key: 'cog', label: 'COG', color: 'bg-yellow-100 text-yellow-800' },
            { key: 'prev', label: 'Prev', color: 'bg-purple-100 text-purple-800' }
        ];

        const renderedIds = new Set();
        const badges = [];

        definitions.forEach(def => {
            if (protocols[def.key]) {
                const uniqueId = def.label; // Deduplicate by Label (e.g. BAT)
                if (!renderedIds.has(uniqueId)) {
                    renderedIds.add(uniqueId);
                    // Match "Dossier en cours" styling exactly:
                    // px-1.5 py-0.5 rounded text-[10px] font-medium leading-none uppercase tracking-wide opacity-90
                    badges.push(`<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none uppercase tracking-wide opacity-90 ${def.color} mr-1">${def.label}</span>`);
                }
            }
        });

        return `<div class="flex flex-wrap gap-1 items-center">${badges.join('')}</div>`;
    }
};
