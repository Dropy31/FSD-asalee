// Livret Pharmaceutique Module

let allMedications = [];
let currentSort = { column: 'dci', direction: 'asc' }; // STATE: Default Sort

// Exposed init function for renderer.js
async function initPharmaBook() {
    console.log('Initializing Pharma Book...');
    await loadMedications();

    // Auto-Import Check
    if (allMedications.length === 0 && window.MEDICATIONS_DB && window.MEDICATIONS_DB.length > 0) {
        console.log('Importing default medications...');
        await importMedications(window.MEDICATIONS_DB);
    }

    setupPharmaEventListeners();
}

async function loadMedications() {
    try {
        allMedications = await window.electronAPI.getMedications();
        applySortAndRender(); // Render with default sort
    } catch (err) {
        console.error('Error loading medications:', err);
        showNotification('Erreur chargement médicaments', 'error');
    }
}

async function importMedications(dataList) {
    let count = 0;
    showNotification('Importation des médicaments en cours...', 'info');

    for (const item of dataList) {
        try {
            const med = {
                dci: item.dci,
                commercial_name: item.commercialName,
                class: item.class,
                route: item.route,
                dosages: Array.isArray(item.dosages) ? item.dosages.join(', ') : item.dosages
            };
            await window.electronAPI.createMedication(med);
            count++;
        } catch (e) {
            console.error('Import failed for:', item.dci, e);
        }
    }

    if (count > 0) {
        showNotification(`${count} médicaments importés avec succès.`, 'success');
        await loadMedications();
    }
}

function applySortAndRender(medicationsOverride = null) {
    const list = medicationsOverride || allMedications;

    // Sort logic
    const sorted = [...list].sort((a, b) => {
        const fieldA = (a[currentSort.column] || '').toLowerCase();
        const fieldB = (b[currentSort.column] || '').toLowerCase();

        if (fieldA < fieldB) return currentSort.direction === 'asc' ? -1 : 1;
        if (fieldA > fieldB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    renderMedicationsTable(sorted);
    updateSortIcons();
}

function updateSortIcons() {
    const columns = ['dci', 'commercial_name', 'class', 'route'];
    columns.forEach(col => {
        const icon = document.getElementById(`icon-sort-${col}`);
        if (!icon) return;

        // Reset
        icon.className = 'fas fa-sort ml-1 text-gray-300'; // Default gray neutral

        if (currentSort.column === col) {
            if (currentSort.direction === 'asc') {
                icon.className = 'fas fa-sort-alpha-down ml-1 text-blue-600'; // Active Asc
            } else {
                icon.className = 'fas fa-sort-alpha-up ml-1 text-blue-600'; // Active Desc
            }
        }
    });
}

function renderMedicationsTable(medications) {
    const tbody = document.getElementById('table-pharma-book');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (medications.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-400 italic">Aucun médicament trouvé</td></tr>`;
        return;
    }

    medications.forEach(med => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors';

        let displayDosages = med.dosages || '-';
        try {
            if (displayDosages.startsWith('[') && displayDosages.endsWith(']')) {
                const parsed = JSON.parse(displayDosages);
                if (Array.isArray(parsed)) displayDosages = parsed.join(', ');
            }
        } catch (e) { /* ignore */ }

        tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-800 text-sm truncate whitespace-nowrap" title="${med.dci}">${med.dci}</td>
            <td class="px-4 py-3 text-gray-600 text-sm truncate whitespace-nowrap" title="${med.commercial_name || ''}">${med.commercial_name || '-'}</td>
            <td class="px-4 py-3 text-gray-600 text-sm truncate whitespace-nowrap" title="${med.class || ''}">${med.class || '-'}</td>
            <td class="px-4 py-3 text-gray-500 italic text-sm truncate whitespace-nowrap" title="${med.route || ''}">${med.route || '-'}</td>
            <td class="px-4 py-3 text-gray-500 text-sm truncate whitespace-nowrap" title="${displayDosages}">${displayDosages}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
                <button class="text-blue-600 hover:text-blue-800 mr-2 btn-edit-med" data-id="${med.id}" title="Éditer">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-red-500 hover:text-red-700 btn-delete-med" data-id="${med.id}" title="Supprimer">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-edit-med').forEach(btn => {
        btn.onclick = (e) => {
            const target = e.target.closest('button');
            if (target) {
                const id = parseInt(target.dataset.id);
                openMedicationModal(id);
            }
        };
    });

    document.querySelectorAll('.btn-delete-med').forEach(btn => {
        btn.onclick = (e) => {
            const target = e.target.closest('button');
            if (target) {
                const id = parseInt(target.dataset.id);
                confirmDeleteMedication(id);
            }
        };
    });
}

function setupPharmaEventListeners() {
    const headers = document.querySelectorAll('th[data-sort]');
    headers.forEach(th => {
        th.onclick = () => {
            const col = th.dataset.sort;
            if (currentSort.column === col) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = col;
                currentSort.direction = 'asc';
            }

            const searchInput = document.getElementById('inp-pharma-search');
            const term = searchInput ? searchInput.value.toLowerCase() : '';

            if (term) {
                const filtered = allMedications.filter(m =>
                    (m.dci && m.dci.toLowerCase().includes(term)) ||
                    (m.commercial_name && m.commercial_name.toLowerCase().includes(term)) ||
                    (m.class && m.class.toLowerCase().includes(term)) ||
                    (m.route && m.route.toLowerCase().includes(term))
                );
                applySortAndRender(filtered);
            } else {
                applySortAndRender();
            }
        };
    });

    const searchInput = document.getElementById('inp-pharma-search');
    if (searchInput) {
        searchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allMedications.filter(m =>
                (m.dci && m.dci.toLowerCase().includes(term)) ||
                (m.commercial_name && m.commercial_name.toLowerCase().includes(term)) ||
                (m.class && m.class.toLowerCase().includes(term)) ||
                (m.route && m.route.toLowerCase().includes(term))
            );
            applySortAndRender(filtered);
        };
    }

    const btnAdd = document.getElementById('btn-new-medication');
    if (btnAdd) {
        btnAdd.onclick = () => {
            openMedicationModal();
        };
    }

    const modal = document.getElementById('modal-medication');
    const closeBtn = document.getElementById('close-modal-med');
    const cancelBtn = document.getElementById('btn-cancel-med');

    const closeModal = () => {
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    const form = document.getElementById('form-medication');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            await saveMedication();
        };
    }
}

function openMedicationModal(id = null) {
    const modal = document.getElementById('modal-medication');
    const title = document.getElementById('modal-med-title');
    const form = document.getElementById('form-medication');

    if (!modal || !form) return;

    form.reset();
    document.getElementById('inp-med-id').value = '';

    if (id) {
        title.textContent = 'Modifier Médicament';
        const med = allMedications.find(m => m.id === id);
        if (med) {
            document.getElementById('inp-med-id').value = med.id;
            document.getElementById('inp-med-dci').value = med.dci || '';
            document.getElementById('inp-med-commercial').value = med.commercial_name || '';
            document.getElementById('inp-med-class').value = med.class || '';
            document.getElementById('inp-med-route').value = med.route || '';
            document.getElementById('inp-med-dosages').value = med.dosages || '';
        }
    } else {
        title.textContent = 'Nouveau Médicament';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Init Custom Combobox Logic
    setupClassCombobox();
}
function setupClassCombobox() {
    const input = document.getElementById('inp-med-class');
    const list = document.getElementById('list-med-class');
    const wrapper = document.getElementById('wrapper-med-class');

    if (!input || !list || !wrapper) return;

    // Make chevron interactive
    // The chevron is usually the 3rd child (index 2) or we find by class.
    const chevronContainer = wrapper.querySelector('.pointer-events-none');
    if (chevronContainer) {
        chevronContainer.classList.remove('pointer-events-none');
        chevronContainer.classList.add('cursor-pointer');

        // Force show all on chevron click
        chevronContainer.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            input.focus();
            renderClassList('', true); // Force Show All
            list.classList.remove('hidden');
        };
    }

    // Render List Function - Attached to window or scope? Scope is fine.
    // Using a named function expression to call it from events
    const renderClassList = (filterText = '', forceShowAll = false) => {
        // Derive classes FRESH from allMedications to avoid stale closures
        const classes = [...new Set(allMedications.map(m => m.class).filter(c => c))].sort();

        list.innerHTML = '';
        const lowerFilter = filterText.toLowerCase();

        // Explain logic: Show all if forceShowAll is true OR if filterText is empty.
        // Otherwise filter.
        const filtered = (forceShowAll || !filterText)
            ? classes
            : classes.filter(c => c.toLowerCase().includes(lowerFilter));

        const exactMatch = classes.some(c => c.toLowerCase() === lowerFilter);

        if (filtered.length === 0 && !filterText && !forceShowAll) {
            // Case: focus with empty text -> show all (handled by forceShowAll usually, or just empty filter implies all)
        }

        // If truly empty results
        if (filtered.length === 0 && !filterText) {
            list.innerHTML = `<div class="px-4 py-2 text-gray-400 text-sm italic">Aucune classe enregistrée</div>`;
            // Allow adding new even if empty?
        } else if (filtered.length === 0) {
            list.innerHTML = `<div class="px-4 py-2 text-gray-400 text-sm italic">Aucune correspondance</div>`;
        }

        // Render options
        if (filtered.length > 0) {
            filtered.forEach(c => {
                const div = document.createElement('div');
                div.className = 'group flex justify-between items-center px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 transition-colors';

                const span = document.createElement('span');
                span.textContent = c;
                div.appendChild(span);

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1';
                deleteBtn.title = `Supprimer la classe "${c}"`;
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';

                deleteBtn.onmousedown = async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    await deleteClassGlobally(c);
                };

                div.appendChild(deleteBtn);

                div.onmousedown = (e) => {
                    if (!e.target.closest('button')) {
                        input.value = c;
                        list.classList.add('hidden');
                    }
                };
                list.appendChild(div);
            });
        }

        // "Add New" Logic
        // Show if text exists AND (forceShowAll is FALSE OR (forceShowAll is TRUE and we really want to suggest adding?))
        // Actually, if I type "Test", I want to see "Add Test".
        // If I click chevron (Force All), I do NOT want to see "Add ''". 
        if (filterText && !exactMatch) {
            if (filtered.length > 0) {
                const separator = document.createElement('div');
                separator.className = 'border-t border-gray-100 my-1';
                list.appendChild(separator);
            }

            const div = document.createElement('div');
            div.className = 'px-4 py-2 hover:bg-green-50 cursor-pointer text-sm text-green-700 font-medium transition-colors flex items-center gap-2';
            div.innerHTML = `<i class="fas fa-plus-circle"></i> Ajouter "${filterText}"`;
            div.onmousedown = () => {
                input.value = filterText;
                list.classList.add('hidden');
            };
            list.appendChild(div);
        }
    };

    // Use .on[event] to replace previous listeners and avoid duplicates
    input.onfocus = () => {
        renderClassList(input.value);
        list.classList.remove('hidden');
    };

    input.oninput = () => {
        renderClassList(input.value);
        list.classList.remove('hidden');
    };

    input.onblur = () => {
        setTimeout(() => {
            list.classList.add('hidden');
        }, 200);
    };

    // Assign to a property on input so we can call it from deleteClassGlobally? 
    // Actually, deleteClassGlobally just needs to trigger input.focus() or click.
    input._renderList = renderClassList; // Hacky but effective for communication
}

async function deleteClassGlobally(className) {
    const medsWithClass = allMedications.filter(m => m.class === className);
    // If no meds used it, it's just in the unique list derived from meds ? 
    // If it's in the list, it MUST be used by at least one med.

    if (!confirm(`Supprimer la classe "${className}" ?\nElle sera retirée de ${medsWithClass.length} médicament(s).`)) {
        return;
    }

    try {
        let updatedCount = 0;
        for (const med of medsWithClass) {
            const updatedMed = { ...med, class: '' };
            await window.electronAPI.updateMedication(med.id, updatedMed);
            updatedCount++;
        }

        showNotification(`${updatedCount} médicaments mis à jour.`, 'success');

        await loadMedications(); // Reloads allMedications

        const input = document.getElementById('inp-med-class');
        if (input) {
            input.value = '';
            input.focus(); // Rerender list
            // Because onfocus calls renderClassList, and renderClassList derives classes from the NEW allMedications,
            // the deleted class will be gone.
        }

    } catch (err) {
        console.error('Error deleting class:', err);
        showNotification('Erreur lors de la suppression de la classe', 'error');
    }
}

async function saveMedication() {
    const id = document.getElementById('inp-med-id').value;
    const dci = document.getElementById('inp-med-dci').value;
    const commercial_name = document.getElementById('inp-med-commercial').value;
    const med_class = document.getElementById('inp-med-class').value;
    const route = document.getElementById('inp-med-route').value;
    const dosages = document.getElementById('inp-med-dosages').value;

    const data = {
        dci,
        commercial_name,
        class: med_class,
        route,
        dosages
    };

    try {
        if (id) {
            await window.electronAPI.updateMedication(parseInt(id), data);
            showNotification('Médicament modifié', 'success');
        } else {
            await window.electronAPI.createMedication(data);
            showNotification('Médicament ajouté', 'success');
        }

        document.getElementById('modal-medication').classList.add('hidden');
        document.getElementById('modal-medication').classList.remove('flex');
        await loadMedications();

    } catch (err) {
        console.error('Error saving medication:', err);
        showNotification('Erreur sauvegarde', 'error');
    }
}

async function confirmDeleteMedication(id) {
    if (confirm('Voulez-vous vraiment supprimer ce médicament ?')) {
        try {
            await window.electronAPI.deleteMedication(id);
            showNotification('Médicament supprimé', 'success');
            await loadMedications();
        } catch (err) {
            console.error('Error deleting medication:', err);
            showNotification('Erreur suppression', 'error');
        }
    }
}

window.initPharmaBook = initPharmaBook;
