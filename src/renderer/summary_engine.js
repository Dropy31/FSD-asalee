
// Summary Generation Engine

/**
 * Generates a formatted clinical summary string based on patient data and template type.
 * @param {Object} patient - The full patient object
 * @param {string} templateId - The ID of the selected template
 * @returns {string} The generated text
 */
function generateSummary(patient, templateId) {
    if (!patient) return "Aucun patient sélectionné.";

    switch (templateId) {
        case 'clinical':
            return generateClinicalResume(patient);
        case 'endo':
            return generateReferralLetter(patient, 'Endocrinologue');
        case 'cardio':
            return generateReferralLetter(patient, 'Cardiologue');
        case 'nephro':
            return generateReferralLetter(patient, 'Néphrologue');
        case 'neuro':
            return generateReferralLetter(patient, 'Neurologue', true); // Light version
        case 'ophtalmo':
            return generateReferralLetter(patient, 'Ophtalmologue', true); // Light version
        default:
            return "Modèle inconnu.";
    }
}

function generateClinicalResume(p) {
    const age = getAge(p.birthDate);
    const duration = getDiabetesDuration(p.diagnosisYear);
    const complications = getComplicationsString(p);

    // Header
    let text = `Patient ${p.lastName?.toUpperCase()} ${p.firstName}, âgé de ${age} ans porteur d'un diabète de type 2 depuis ${duration}, ${complications}.\n\n`;

    // Biological Status Loop
    const targets = { hba1c: 7.0, bpSys: 130, bpDia: 80, ldl: 0.55 }; // Default strict targets (customizable?)
    // Actually, targets might depend on profile. For now hardcode or use logic. 
    // User example showed 7.0 for HbA1c and 1.6 for LDL (maybe 1.6g/L is high? usually 0.55-1.0 depending on risk).
    // Let's use generic logic: Value vs Target.

    // 1. Glycémie
    const lastHba1c = getLastBioValue(p, 'hba1c');
    text += `- ${getStatusString('glycémique', lastHba1c, 7.0, '%')}\n`;

    // 2. Tension
    const lastBpSys = getLastBioValue(p, 'sys'); // Changed from bp_sys
    const lastBpDia = getLastBioValue(p, 'dia'); // Changed from bp_dia
    text += `- ${getBPStatusString(lastBpSys, lastBpDia, 130, 80)}\n`;

    // 3. Lipides
    const lastLdl = getLastBioValue(p, 'ldl'); // Changed from lipid_ldl
    text += `- ${getStatusString('lipidique (LDL)', lastLdl, 0.70, 'g/L')}\n`; // 0.70 is a common target, user said 1.60/0.55

    // 4. SCORE2
    text += `- Le patient présente un risque cardiovasculaire ${getRiskString(p)}.\n\n`;

    // Treatments
    text += `Aucun traitement médicamenteux actif n'est actuellement enregistré.\n\n`;
    if (p.treatments && p.treatments.length > 0) {
        text = text.replace("Aucun traitement médicamenteux actif n'est actuellement enregistré.\n\n", "Traité actuellement par :\n");
        p.treatments.forEach(t => {
            text += `- ${t.name} - ${t.dosage} ${t.unit} - ${t.frequency}\n`;
        });
        text += "\n";
    }

    // Footer
    text += "La prise en charge hygiéno-diététique et éducative est assurée par notre IDE ASALEE.";

    return text;
}

function generateReferralLetter(p, specialist, isLight = false) {
    const today = new Date().toLocaleDateString('fr-FR');
    let text = `\t\t\t\t\t\t\t\tLe ${today}\n\n`;
    text += `Objet : Adressage patient pour avis ${specialist}\n\n`;
    text += `Cher Confrère,\n\n`;

    // Intro matches clinical resume
    text += `Je vous adresse ${p.lastName?.toUpperCase()} ${p.firstName}, ${getAge(p.birthDate)} ans.\n`;
    text += `Motif : [Préciser le motif de la consultation]\n\n`;

    // Paste the Clinical Resume core
    text += "--- Résumé Clinique ---\n";
    text += generateClinicalResume(p);
    text += "\n---------------------\n\n";

    if (!isLight) {
        // Add more deep data for Cardio/Endo/Nephro if needed
        // For now, the clinical resume is quite complete. 
        // We could add history of exams?
    }

    text += `\nJe vous remercie de votre avis expert.\n\nCordialement,\n\nDr [Nom Médecin] / IDE Asalée`;
    return text;
}


// --- Helpers ---

function getAge(birthDate) {
    if (!birthDate) return "--";
    const today = new Date();
    const birthDateObj = new Date(birthDate);
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const m = today.getMonth() - birthDateObj.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) {
        age--;
    }
    return age;
}

function getDiabetesDuration(year) {
    if (!year) return "--";
    const duration = new Date().getFullYear() - parseInt(year);
    return `${duration} ans`;
}

function getComplicationsLists(p) {
    const micro = p.riskProfile?.micro || {};
    const macro = p.riskProfile?.macro || {};
    const others = p.riskProfile?.others || {};

    const lists = { micro: [], macro: [] };

    // Microvascular
    if (micro.retino === 'OUI') lists.micro.push(`Rétinopathie`);
    if (micro.nephro === 'OUI') lists.micro.push(`Néphropathie`);
    if (micro.neuroSens === 'OUI') lists.micro.push(`Neuropathie Sensitive`);
    if (micro.neuroAuto === 'OUI') lists.micro.push(`Neuropathie Autonome`);
    // Foot is sort of micro/neuro
    if (others.foot && others.foot !== 'Grade 0') lists.micro.push(`Risque Pied (${others.foot})`);

    // Macrovascular
    if (macro.avc === 'OUI') lists.macro.push("Antécédent AVC");
    if (macro.coronary === 'OUI') lists.macro.push("Coronaropathie (IDM/Stent)");
    if (macro.aomi === 'OUI') lists.macro.push("AOMI");
    if (macro.stenosis === 'OUI') lists.macro.push("Sténose Carotidienne");
    if (others.hf === 'OUI') lists.macro.push("Insuffisance Cardiaque");  // Often grouped with macro/cardio
    if (others.afib === 'OUI') lists.macro.push("Fibrillation Atriale");

    return lists;
}

function getLastBioEntry(p) {
    if (!p.biologicalHistory || !Array.isArray(p.biologicalHistory)) return null;
    const sorted = [...p.biologicalHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted[0] || null;
}

function getLastBioValue(p, key) {
    const entry = getLastBioEntry(p);
    return (entry && entry[key] !== undefined && entry[key] !== null && entry[key] !== "") ? entry[key] : "--";
}

function getStatusString(context, value, target, unit) {
    if (value === "--" || value === undefined) return `statut ${context} inconnu (données manquantes)`;

    const floatVal = parseFloat(value);
    if (isNaN(floatVal)) return `statut ${context} à vérifier (valeur: ${value} ${unit})`;

    let status = "équilibré";
    // For LDL and HbA1c, lower is better.
    if (floatVal > target) status = "déséquilibré";

    return `${status} sur le plan ${context} (dernière valeur : ${value} ${unit}) pour une cible à ${target} ${unit}`;
}

function getBPStatusString(sys, dia, ticketSys, targetDia) {
    if (sys === "--" || dia === "--") return "statut tensionnel inconnu (données manquantes)";

    const s = parseFloat(sys);
    const d = parseFloat(dia);

    if (s > ticketSys || d > targetDia) {
        return `déséquilibré sur le plan tensionnel (dernière valeur : ${sys}/${dia} mmHg)`;
    }
    return `équilibré sur le plan tensionnel (dernière valeur : ${sys}/${dia} mmHg)`;
}

function getScoreExplanation(p) {
    const age = getAge(p.birthDate);
    const entry = getLastBioEntry(p);

    // 1. Check for Overrides (Very High Risk)
    // Need to check currentProfile flags + entry calculations
    const micro = p.riskProfile?.micro || {};
    const macro = p.riskProfile?.macro || {};

    const hasASCVD = (macro.avc === 'OUI' || macro.coronary === 'OUI' || macro.aomi === 'OUI' || macro.stenosis === 'OUI');
    let isSevereTOD = false;

    // Check Micro count (>=3)
    let microCount = 0;
    if (micro.retino === 'OUI') microCount++;
    if (micro.nephro === 'OUI') microCount++;
    if (micro.neuroSens === 'OUI') microCount++;
    if (micro.neuroAuto === 'OUI') microCount++;
    if (microCount >= 3) isSevereTOD = true;

    // Check DFG/RAC from latest entry
    if (entry) {
        const dfg = parseFloat(entry.dfg);
        const rac = parseFloat(entry.rac);
        if (!isNaN(dfg)) {
            if (dfg < 45) isSevereTOD = true;
            if (dfg >= 45 && dfg <= 59 && rac >= 30) isSevereTOD = true;
        }
        if (!isNaN(rac) && rac > 300) isSevereTOD = true;
    }

    if (hasASCVD || isSevereTOD) {
        return "SCORE2-diabète non calculable au titre d'un risque CV très élevé d'emblée (Maladie Cardiovasculaire Athéromateuse ou Atteinte d'Organe Cible Sévère).";
    }

    // 2. Check Age
    if (age < 40 || age >= 70) {
        return `SCORE2-diabète non réalisé en raison de l'âge du patient (${age} ans). Le modèle est valide pour les 40-69 ans.`;
    }

    // 3. Check Data Availability
    // If we have a calculated score in the entry, use it.
    if (entry && entry.score2d && entry.score2d !== "" && entry.score2d !== "-") {
        let riskLevel = "FAIBLE";
        const s = parseFloat(entry.score2d);
        if (s >= 5 && s < 10) riskLevel = "MODÉRÉ";
        if (s >= 10 && s < 20) riskLevel = "ÉLEVÉ";
        if (s >= 20) riskLevel = "TRÈS ÉLEVÉ";

        return `= ${entry.score2d}% le plaçant donc à risque cardiovasculaire ${riskLevel}`;
    }

    return "SCORE2-diabète non réalisé au titre d'informations manquantes (HbA1c, DFG, Cholestérol ou Tension non renseignés).";
}

function generateClinicalResume(p) {
    const age = getAge(p.birthDate);
    const duration = getDiabetesDuration(p.diagnosisYear);
    const comps = getComplicationsLists(p);

    // Header matching user request
    let text = `Patient ${p.lastName?.toUpperCase()} ${p.firstName}, âgé de ${age} ans porteur d'un diabète de type 2 depuis ${duration}, caractérisé par :\n`;

    // Complications
    const macroStr = comps.macro.length > 0 ? comps.macro.join(', ') : "Aucune complication vasculaire constituée";
    text += `- sur le plan macrovasculaire : ${macroStr}\n`;

    const microStr = comps.micro.length > 0 ? comps.micro.join(', ') : "Aucune complication microvasculaire";
    text += `- sur le plan microvasculaire : ${microStr}\n`;

    // Biological Status
    // 1. Glycémie
    const lastHba1c = getLastBioValue(p, 'hba1c');
    text += `- ${getStatusString('glycémique', lastHba1c, 7.0, '%')}\n`;

    // 2. Tension
    const lastBpSys = getLastBioValue(p, 'sys');
    const lastBpDia = getLastBioValue(p, 'dia');
    text += `- ${getBPStatusString(lastBpSys, lastBpDia, 130, 80)}\n`; // Assuming 130/80 default

    // 3. Lipides
    const lastLdl = getLastBioValue(p, 'ldl');
    text += `- ${getStatusString('lipidique (LDL)', lastLdl, 1.0, 'g/L')}\n`; // User used 1.0 as target example

    // 4. SCORE2
    text += `- Le patient présente un ${getScoreExplanation(p)}\n\n`;

    // Treatments
    text += `Aucun traitement médicamenteux actif n'est actuellement enregistré.\n\n`;
    if (p.treatments && p.treatments.length > 0) {
        text = text.replace("Aucun traitement médicamenteux actif n'est actuellement enregistré.\n\n", "Traité actuellement par :\n");
        p.treatments.forEach(t => {
            text += `- ${t.name} - ${t.dosage} ${t.unit} - ${t.frequency}\n`;
        });
        text += "\n";
    }

    // Footer
    text += "La prise en charge hygiéno-diététique et d'éducation thérapeutique est assurée par notre IDE ASALEE.";

    return text;
}

// --- Macro Registry & Engine ---

let MACRO_REGISTRY = [];

/**
 * DATA DICTIONARY (System Variables)
 * Maps internal IDs (value_path) to their logic/getters on the patient object.
 */
const MACRO_SOURCES = {
    // 1. Identity
    'patient_lastname': { label: 'Nom', category: 'Identité', get: p => p.lastName },
    'patient_firstname': { label: 'Prénom', category: 'Identité', get: p => p.firstName },
    'patient_birthdate': { label: 'Date de Naissance', category: 'Identité', get: p => p.birthDate ? new Date(p.birthDate).toLocaleDateString('fr-FR') : '--' },
    'patient_gender': { label: 'Sexe', category: 'Identité', get: p => (p.gender === 'female' || p.gender === 'F') ? 'Femme' : 'Homme' },
    'patient_civility': { label: 'Civilité', category: 'Identité', get: p => (p.gender === 'female' || p.gender === 'F') ? 'Madame' : 'Monsieur' },
    'diagnosis_year': { label: 'Année Diagnostic', category: 'Identité', get: p => p.diagnosisYear },
    'patient_doctor': { label: 'Médecin Traitant', category: 'Identité', get: p => p.doctor || '--' },
    'patient_age': { label: 'Age', category: 'Identité', get: p => getAge(p.birthDate) },
    'diabetes_duration': { label: 'Ancienneté Diabète', category: 'Identité', get: p => getDiabetesDuration(p.diagnosisYear) },

    // 2. Profil (formerly Antécédents)
    'history_hta': { label: 'HTA', category: 'Profil', get: p => p.riskProfile?.macro?.hta || 'NON' },
    'history_dyslip': { label: 'Dyslipidémie', category: 'Profil', get: p => p.riskProfile?.macro?.dyslip || 'NON' },
    'history_smoke': { label: 'Tabagisme', category: 'Profil', get: p => p.riskProfile?.others?.smoke || 'NON' },
    'history_family_cv': { label: 'Hérédité CV', category: 'Profil', get: p => p.riskProfile?.others?.family || 'NON' },
    'history_avc': { label: 'AVC/AIT', category: 'Profil', get: p => p.riskProfile?.macro?.avc || 'NON' },
    'history_coronary': { label: 'Coronaropathie', category: 'Profil', get: p => p.riskProfile?.macro?.coronary || 'NON' },
    'history_aomi': { label: 'AOMI', category: 'Profil', get: p => p.riskProfile?.macro?.aomi || 'NON' },
    'history_stenosis': { label: 'Sténose Carotidienne', category: 'Profil', get: p => p.riskProfile?.macro?.stenosis || 'NON' },
    'history_retino': { label: 'Rétinopathie', category: 'Profil', get: p => p.riskProfile?.micro?.retino || 'NON' },
    'history_nephro': { label: 'Néphropathie', category: 'Profil', get: p => p.riskProfile?.micro?.nephro || 'NON' },
    'history_neuro_sens': { label: 'Neuro. Sensitive', category: 'Profil', get: p => p.riskProfile?.micro?.neuroSens || 'NON' },
    'history_neuro_auto': { label: 'Neuro. Autonome', category: 'Profil', get: p => p.riskProfile?.micro?.neuroAuto || 'NON' },
    'history_hf': { label: 'Insuffisance Cardiaque', category: 'Profil', get: p => p.riskProfile?.others?.hf || 'NON' },
    'history_afib': { label: 'Fibrillation Atriale', category: 'Profil', get: p => p.riskProfile?.others?.afib || 'NON' },
    'history_foot': { label: 'Risque Pied', category: 'Profil', get: p => p.riskProfile?.others?.foot || 'Grade 0' },
    'history_liver': { label: 'Atteinte Hépatique', category: 'Profil', get: p => p.riskProfile?.others?.liver || 'NON' },

    // 3. Biologie
    'last_weight': { label: 'Dernier Poids', category: 'Biologie', get: p => getLastBioValue(p, 'weight') + ' kg' },
    'last_height': { label: 'Dernière Taille', category: 'Biologie', get: p => getLastBioValue(p, 'height') + ' cm' },
    'last_bmi': { label: 'Dernier IMC', category: 'Biologie', get: p => getLastBioValue(p, 'bmi') + ' kg/m²' },
    'last_hba1c': { label: 'Dernier HbA1c', category: 'Biologie', get: p => getLastBioValue(p, 'hba1c') + ' %' },
    'last_ct': { label: 'Dernier CT', category: 'Biologie', get: p => getLastBioValue(p, 'ct') + ' g/L' },
    'last_hdl': { label: 'Dernier HDL', category: 'Biologie', get: p => getLastBioValue(p, 'hdl') + ' g/L' },
    'last_tg': { label: 'Dernier TG', category: 'Biologie', get: p => getLastBioValue(p, 'tg') + ' g/L' },
    'last_non_hdl': { label: 'Dernier Non-HDL', category: 'Biologie', get: p => getLastBioValue(p, 'non_hdl') + ' g/L' },
    'last_ldl': { label: 'Dernier LDLc', category: 'Biologie', get: p => getLastBioValue(p, 'ldl') + ' g/L' },
    'last_crea': { label: 'Dernière Créatinine', category: 'Biologie', get: p => getLastBioValue(p, 'creatinine') + ' µmol/L' },
    'last_dfg': { label: 'Dernier DFG', category: 'Biologie', get: p => getLastBioValue(p, 'dfg') + ' mL/min' },
    'last_rac': { label: 'Dernier RAC', category: 'Biologie', get: p => getLastBioValue(p, 'rac') + ' mg/g' },
    'last_sys': { label: 'Dernière PAS', category: 'Biologie', get: p => getLastBioValue(p, 'sys') + ' mmHg' },
    'last_dia': { label: 'Dernière PAD', category: 'Biologie', get: p => getLastBioValue(p, 'dia') + ' mmHg' },
    'last_score2': { label: 'Dernier SCORE2', category: 'Biologie', get: p => getLastBioValue(p, 'score2d') + ' %' },

    // 4. Date
    'date_last_val': {
        label: 'Date Dernier Bilan', category: 'Date', get: p => {
            const entry = getLastBioEntry(p);
            return entry ? new Date(entry.date).toLocaleDateString('fr-FR') : 'Jamais';
        }
    },
    'today_date': { label: 'Date du jour', category: 'Date', get: () => new Date().toLocaleDateString('fr-FR') },

    // 5. Examens (Suivi)
    'followup_hba1c': { label: 'Date Suivi HbA1c', category: 'Examens', get: () => 'Non Renseigné' },
    'followup_lipid': { label: 'Date Suivi Lipides', category: 'Examens', get: () => 'Non Renseigné' },
    'followup_rac': { label: 'Date Suivi RAC', category: 'Examens', get: () => 'Non Renseigné' },
    'followup_ecg': { label: 'Date Suivi ECG', category: 'Examens', get: () => 'Non Renseigné' },
    'followup_foot': { label: 'Date Suivi Pieds', category: 'Examens', get: () => 'Non Renseigné' },
    'followup_dental': { label: 'Date Suivi Dentiste', category: 'Examens', get: () => 'Non Renseigné' },
    'followup_eye': { label: 'Date Suivi Ophtalmo', category: 'Examens', get: () => 'Non Renseigné' },

    // 6. Traitement
    'current_treatment': {
        label: 'Traitement Actif', category: 'Traitement', get: p => {
            if (!p.treatments || p.treatments.length === 0) return "Aucun traitement";
            return p.treatments.map(t => `${t.name} ${t.dosage} ${t.unit}`).join(', ');
        }
    },

    // 7. Signature / Autres
    'user_signature': { label: 'Signature', category: 'Signature', get: () => "Dr [Nom] / IDE Asalée" },
    'patient_allergies': { label: 'Allergies', category: 'Autres', get: p => p.allergies || 'Aucune' },
    'patient_intolerances': { label: 'Intolérances', category: 'Autres', get: p => p.intolerances || 'Aucune' },
};


// System Script Resolvers (Keep for backward compat or specific logic macros if needed)
// We might not need this anymore if everything is in MACRO_SOURCES or resolved via DB.
const SYSTEM_RESOLVERS = {
    // Keep 'complications_macro' etc if they are complex aggregations not simple lookups
    'complications_macro': p => {
        const c = getComplicationsLists(p);
        return c.macro.length > 0 ? c.macro.join(', ') : "Aucune complication vasculaire constituée";
    },
    'complications_micro': p => {
        const c = getComplicationsLists(p);
        return c.micro.length > 0 ? c.micro.join(', ') : resolveTextMacro('txt_none_micro', "Aucune complication microvasculaire");
    },
    'full_complications': p => { // Re-expose complications string
        return getComplicationsString(p);
    },
    'status_glycemic': p => getStatusString('glycémique', getLastBioValue(p, 'hba1c'), 7.0, '%'),
    'status_lipid': p => getStatusString('lipidique (LDL)', getLastBioValue(p, 'ldl'), 0.70, 'g/L'),
    'status_bp': p => getBPStatusString(getLastBioValue(p, 'sys'), getLastBioValue(p, 'dia'), 130, 80),
    'risk_score': p => getRiskString(p),
    'treatment_list': p => {
        if (!p.treatments || p.treatments.length === 0) return "Aucun traitement médicamenteux actif n'est actuellement enregistré.";
        return p.treatments.map(t => `- ${t.name} ${t.dosage} ${t.unit} (${t.frequency})`).join('\n');
    },
    'list_fdr_cv': p => {
        const factors = [];
        // Age
        const age = getAge(p.birthDate);
        const isMale = p.gender === 'male' || p.gender === 'M';
        if ((isMale && age > 50) || (!isMale && age > 60)) factors.push(`Age (> ${isMale ? 50 : 60} ans)`);

        // Hérédité
        if (p.riskProfile?.others?.family === 'OUI') factors.push("Hérédité");

        // Tabac
        if (p.riskProfile?.others?.smoke === 'OUI' || p.riskProfile?.others?.smoke === 'TABAGISME ACTIF') factors.push("Tabagisme");

        // HTA
        if (p.riskProfile?.macro?.hta === 'OUI') factors.push("HTA");

        // Dyslipidémie
        if (p.riskProfile?.macro?.dyslip === 'OUI') factors.push("Dyslipidémie");

        // Diabète (Always true contextually)
        factors.push("Diabète");

        return factors.length > 0 ? factors.join(', ') : "Aucun facteur de risque identifié";
    }
};

// Helper: Resolve a text macro by code, looking up registry or fallback
function resolveTextMacro(code, fallback) {
    const macro = MACRO_REGISTRY.find(m => m.code === code); // Registry now uses 'code' matching DB
    // If found and has template_text, use it, else fallback
    if (macro && macro.template_text) return macro.template_text;
    return fallback;
}

// Helper: Get Complications String (needed for 'full_complications' script)
function getComplicationsString(p) {
    const lists = getComplicationsLists(p);
    const all = [...lists.macro, ...lists.micro];
    if (all.length === 0) return "Aucune complication signalée";
    return all.join(', ');
}

// Helper: Risk String (needed for 'risk_score' script)
function getRiskString(p) {
    return getScoreExplanation(p);
}


async function reloadMacros() {
    try {
        const dbMacros = await window.electronAPI.getMacros();

        MACRO_REGISTRY = dbMacros.map(m => {
            return {
                id: m.code,
                label: m.label,
                category: m.category,
                type: m.type,
                value_path: m.value_path,
                template_text: m.template_text,
                resolve: (patient) => {
                    // 1. TEXT TYPE
                    if (m.type === 'text') {
                        return m.template_text || '';
                    }

                    // 2. VALUE / QUANTITATIF / QUALITATIF
                    // Uses value_path as key to MACRO_SOURCES
                    if (m.type === 'value' || m.type === 'quantitatif' || m.type === 'qualitatif') {
                        const sourceKey = m.value_path;
                        const source = MACRO_SOURCES[sourceKey];
                        if (source && typeof source.get === 'function') {
                            return source.get(patient);
                        }
                        // Fallback: maybe it's a direct property?
                        return patient[sourceKey] || '--';
                    }

                    // 3. LEGACY SCRIPT (System)
                    if (m.type === 'script') {
                        const resolver = SYSTEM_RESOLVERS[m.code];
                        if (resolver) return resolver(patient);
                        // Try MACRO_SOURCES as fallback for scripts too
                        if (MACRO_SOURCES[m.code]) return MACRO_SOURCES[m.code].get(patient);
                        return `[Script Error: ${m.code}]`;
                    }
                    return '??';
                }
            };
        });

        console.log("Macros reloaded:", MACRO_REGISTRY.length);
        if (window.renderMacroList) window.renderMacroList();

    } catch (e) {
        console.error("Failed to load macros", e);
    }
}


/**
 * Replaces macros in the format {{macro_id}} with their resolved values.
 */
function renderTemplate(templateContent, patient) {
    if (!templateContent) return "";
    let rendered = templateContent;

    MACRO_REGISTRY.forEach(macro => {
        const placeholder = `{{${macro.id}}}`;
        // Replace all occurrences
        if (rendered.includes(placeholder)) {
            try {
                const val = macro.resolve(patient);
                rendered = rendered.split(placeholder).join(val);
            } catch (e) {
                console.error(`Error resolving macro ${macro.id}`, e);
                rendered = rendered.split(placeholder).join("[ERREUR]");
            }
        }
    });

    return rendered;
}

function getAvailableMacros() {
    return MACRO_REGISTRY.map(m => ({ id: m.id, label: m.label, category: m.category, type: m.type }));
}

function resolveMacro(macroId, patient) {
    const macro = MACRO_REGISTRY.find(m => m.id === macroId);
    if (!macro) return "Macro inconnue";

    // Dummy patient for preview if none provided (Expanded)
    const context = patient || {
        lastName: 'DUPONT',
        firstName: 'Jean',
        birthDate: '1970-01-01',
        gender: 'male',
        diagnosisYear: '2015',
        treatments: [
            { name: 'METFORMINE', dosage: '1000mg', unit: 'mg', frequency: 'Matin et Soir' }
        ],
        riskProfile: {
            micro: { retino: 'NON', nephro: 'NON', neuroSens: 'NON', neuroAuto: 'NON' },
            macro: { avc: 'NON', coronary: 'NON', aomi: 'NON', stenosis: 'NON' },
            others: { foot: 'Grade 0', hf: 'NON', afib: 'NON', smoke: 'NON' }
        },
        biologicalHistory: [
            { date: new Date().toISOString(), hba1c: '7.5', sys: '135', dia: '85', ldl: '1.10', dfg: '85', weight: '85', height: '175', bmi: '27.7' }
        ]
    };

    try {
        return macro.resolve(context);
    } catch (err) {
        return "Erreur lors de la résolution";
    }
}

// Expose Dictionary
function getMacroSources() {
    // Return array for Select Dropdown
    return Object.keys(MACRO_SOURCES).map(key => ({
        id: key,
        label: MACRO_SOURCES[key].label,
        category: MACRO_SOURCES[key].category
    })).sort((a, b) => a.label.localeCompare(b.label));
}


// Expose to Window
window.generateSummary = generateSummary;
window.renderTemplate = renderTemplate;
window.getAvailableMacros = getAvailableMacros;
window.resolveMacro = resolveMacro;
window.reloadMacros = reloadMacros;
window.getMacroSources = getMacroSources; // New API
