window.MEDICATIONS_DB = [
    // Biguanides
    { class: "Biguanide", dci: "Metformine", commercialName: "GLUCOPHAGE", route: "Orale", dosages: ["500 mg", "850 mg", "1000 mg"] },
    { class: "Biguanide", dci: "Metformine embonate", commercialName: "STAGID", route: "Orale", dosages: ["700 mg"] },

    // Sulfamides
    { class: "Sulfamide", dci: "Gliclazide", commercialName: "DIAMICRON", route: "Orale", dosages: ["30 mg (LM)", "60 mg (LM)"] },
    { class: "Sulfamide", dci: "Glimepiride", commercialName: "AMAREL", route: "Orale", dosages: ["1 mg", "2 mg", "3 mg", "4 mg"] },
    { class: "Sulfamide", dci: "Glibenclamide", commercialName: "DAONIL", route: "Orale", dosages: ["5 mg"] },

    // Repaglinide
    { class: "Repaglinide", dci: "Repaglinide", commercialName: "NOVONORM", route: "Orale", dosages: ["0.5 mg", "1 mg", "2 mg"] },

    // IDPP-4
    { class: "IDPP-4", dci: "Sitagliptine", commercialName: "JANUVIA", route: "Orale", dosages: ["25 mg", "50 mg", "100 mg"] },
    { class: "IDPP-4", dci: "Vildagliptine", commercialName: "GALVUS", route: "Orale", dosages: ["50 mg"] },
    { class: "IDPP-4", dci: "Saxagliptine", commercialName: "ONGLYZA", route: "Orale", dosages: ["2.5 mg", "5 mg"] },
    { class: "IDPP-4", dci: "Linagliptine", commercialName: "TRAJENTA", route: "Orale", dosages: ["5 mg"] },

    // Analogue GLP-1
    { class: "Analogue GLP-1", dci: "Semaglutide", commercialName: "OZEMPIC", route: "SC (Inj)", dosages: ["0.25 mg", "0.5 mg", "1 mg"] },
    { class: "Analogue GLP-1", dci: "Dulaglutide", commercialName: "TRULICITY", route: "SC (Inj)", dosages: ["0.75 mg", "1.5 mg", "3 mg", "4.5 mg"] },
    { class: "Analogue GLP-1", dci: "Liraglutide", commercialName: "VICTOZA", route: "SC (Inj)", dosages: ["6 mg/ml (Stylo prérempli)"] },
    { class: "Analogue GLP-1", dci: "Semaglutide", commercialName: "RYBELSUS", route: "Orale", dosages: ["3 mg", "7 mg", "14 mg"] },

    // Inhibiteur SGLT-2
    { class: "Inhibiteur SGLT-2", dci: "Dapagliflozine", commercialName: "FORXIGA", route: "Orale", dosages: ["10 mg"] },
    { class: "Inhibiteur SGLT-2", dci: "Empagliflozine", commercialName: "JARDIANCE", route: "Orale", dosages: ["10 mg", "25 mg"] },

    // Insulines
    { class: "Insuline lente", dci: "Insuline Glargine", commercialName: "LANTUS", route: "SC (Inj)", dosages: ["100 U/ml"] },
    { class: "Insuline lente", dci: "Insuline Glargine", commercialName: "TOUJEO", route: "SC (Inj)", dosages: ["300 U/ml"] },
    { class: "Insuline lente", dci: "Insuline Detemir", commercialName: "LEVEMIR", route: "SC (Inj)", dosages: ["100 U/ml"] },
    { class: "Insuline lente", dci: "Insuline Degludec", commercialName: "TRESIBA", route: "SC (Inj)", dosages: ["100 U/ml", "200 U/ml"] },

    { class: "Insuline rapide", dci: "Insuline Asparte", commercialName: "NOVORAPID", route: "SC / IV", dosages: ["100 U/ml (Stylo/Cartouche)"] },
    { class: "Insuline rapide", dci: "Insuline Lispro", commercialName: "HUMALOG", route: "SC / IV", dosages: ["100 U/ml", "200 U/ml (Stylo/Cartouche)"] },
    { class: "Insuline rapide", dci: "Insuline Glulisine", commercialName: "APIDRA", route: "SC / IV", dosages: ["100 U/ml (Stylo/Cartouche)"] },

    { class: "Pompe à insuline", dci: "Insuline Asparte", commercialName: "NOVORAPID PUMPCART", route: "SC (Pompe)", dosages: ["100 U/ml (Cartouche pour pompe)"] },
    { class: "Pompe à insuline", dci: "Insuline Lispro", commercialName: "HUMALOG", route: "SC (Pompe)", dosages: ["100 U/ml (Flacon 10ml)"] },
    { class: "Pompe à insuline", dci: "Insuline Asparte", commercialName: "FIASP", route: "SC (Pompe)", dosages: ["100 U/ml (Flacon 10ml / PumpCart)"] },

    // Hypolipémiants
    { class: "Hypolipémiants", dci: "Atorvastatine", commercialName: "TAHOR", route: "Orale", dosages: ["10 mg", "20 mg", "40 mg", "80 mg"] },
    { class: "Hypolipémiants", dci: "Rosuvastatine", commercialName: "CRESTOR", route: "Orale", dosages: ["5 mg", "10 mg", "20 mg"] },
    { class: "Hypolipémiants", dci: "Simvastatine", commercialName: "ZOCOR", route: "Orale", dosages: ["10 mg", "20 mg", "40 mg"] },
    { class: "Hypolipémiants", dci: "Pravastatine", commercialName: "ELISOR", route: "Orale", dosages: ["10 mg", "20 mg", "40 mg"] },
    { class: "Hypolipémiants", dci: "Ezetimibe", commercialName: "EZETROL", route: "Orale", dosages: ["10 mg"] },
    { class: "Hypolipémiants", dci: "Fenofibrate", commercialName: "LIPANTHYL", route: "Orale", dosages: ["67 mg", "145 mg", "160 mg", "200 mg"] },
    { class: "Hypolipémiants", dci: "Evolocumab", commercialName: "REPATHA", route: "SC (Inj)", dosages: ["140 mg (Stylo)"] },
    { class: "Hypolipémiants", dci: "Alirocumab", commercialName: "PRALUENT", route: "SC (Inj)", dosages: ["75 mg", "150 mg"] },

    // Antiagrégants
    { class: "Antiagrégants", dci: "Acide acétylsalicylique", commercialName: "KARDEGIC", route: "Orale", dosages: ["75 mg", "160 mg", "300 mg"] },
    { class: "Antiagrégants", dci: "Clopidogrel", commercialName: "PLAVIX", route: "Orale", dosages: ["75 mg", "300 mg"] },
    { class: "Antiagrégants", dci: "Ticagrelor", commercialName: "BRILIQUE", route: "Orale", dosages: ["60 mg", "90 mg"] },
    { class: "Antiagrégants", dci: "Prasugrel", commercialName: "EFIENT", route: "Orale", dosages: ["5 mg", "10 mg"] },

    // Anticoagulants
    { class: "Anticoagulant (AVK)", dci: "Warfarine", commercialName: "COUMADINE", route: "Orale", dosages: ["2 mg", "5 mg"] },
    { class: "Anticoagulant (AVK)", dci: "Fluindione", commercialName: "PREVISCAN", route: "Orale", dosages: ["20 mg"] },
    { class: "Anticoagulant (AVK)", dci: "Acénocoumarol", commercialName: "SINTROM", route: "Orale", dosages: ["4 mg"] },
    { class: "Anticoagulant (AVK)", dci: "Acénocoumarol", commercialName: "MINISINTROM", route: "Orale", dosages: ["1 mg"] },

    { class: "Anticoagulant (AOD)", dci: "Rivaroxaban", commercialName: "XARELTO", route: "Orale", dosages: ["2.5 mg", "10 mg", "15 mg", "20 mg"] },
    { class: "Anticoagulant (AOD)", dci: "Apixaban", commercialName: "ELIQUIS", route: "Orale", dosages: ["2.5 mg", "5 mg"] },
    { class: "Anticoagulant (AOD)", dci: "Dabigatran", commercialName: "PRADAXA", route: "Orale", dosages: ["75 mg", "110 mg", "150 mg"] },
    { class: "Anticoagulant (AOD)", dci: "Edoxaban", commercialName: "LIXIANA", route: "Orale", dosages: ["15 mg", "30 mg", "60 mg"] },

    // Bétabloquants
    { class: "Bétabloquant", dci: "Bisoprolol", commercialName: "CARDENSIEL", route: "Orale", dosages: ["1.25 mg", "2.5 mg", "3.75 mg", "5 mg", "7.5 mg", "10 mg"] },
    { class: "Bétabloquant", dci: "Nebivolol", commercialName: "TEMERIT", route: "Orale", dosages: ["5 mg"] },
    { class: "Bétabloquant", dci: "Atenolol", commercialName: "TENORMINE", route: "Orale", dosages: ["50 mg", "100 mg"] },
    { class: "Bétabloquant", dci: "Metoprolol", commercialName: "LOPRESSOR", route: "Orale", dosages: ["100 mg", "200 mg (LP)"] },
    { class: "Bétabloquant", dci: "Carvedilol", commercialName: "KREDEX", route: "Orale", dosages: ["6.25 mg", "12.5 mg", "25 mg", "50 mg"] },
    { class: "Bétabloquant", dci: "Propranolol", commercialName: "AVLOCARDYL", route: "Orale", dosages: ["40 mg", "160 mg (LP)"] },
    { class: "Bétabloquant", dci: "Sotalol", commercialName: "SOTALEX", route: "Orale", dosages: ["80 mg", "160 mg"] },

    // IEC/ARA-2
    { class: "IEC/ARA-2", dci: "Ramipril", commercialName: "TRIATEC", route: "Orale", dosages: ["1.25 mg", "2.5 mg", "5 mg", "10 mg"] },
    { class: "IEC/ARA-2", dci: "Perindopril Arginine", commercialName: "COVERSYL", route: "Orale", dosages: ["2.5 mg", "5 mg", "10 mg"] },
    { class: "IEC/ARA-2", dci: "Enalapril", commercialName: "RENITEC", route: "Orale", dosages: ["5 mg", "20 mg"] },
    { class: "IEC/ARA-2", dci: "Lisinopril", commercialName: "ZESTRIL", route: "Orale", dosages: ["5 mg", "20 mg"] },
    { class: "IEC/ARA-2", dci: "Valsartan", commercialName: "TAREG", route: "Orale", dosages: ["40 mg", "80 mg", "160 mg"] },
    { class: "IEC/ARA-2", dci: "Irbesartan", commercialName: "APROVEL", route: "Orale", dosages: ["75 mg", "150 mg", "300 mg"] },
    { class: "IEC/ARA-2", dci: "Candesartan", commercialName: "ATACAND", route: "Orale", dosages: ["4 mg", "8 mg", "16 mg", "32 mg"] },
    { class: "IEC/ARA-2", dci: "Losartan", commercialName: "COZAAR", route: "Orale", dosages: ["50 mg", "100 mg"] },
    { class: "IEC/ARA-2", dci: "Telmisartan", commercialName: "MICARDIS", route: "Orale", dosages: ["40 mg", "80 mg"] },
    { class: "IEC/ARA-2", dci: "Sacubitril/Valsartan", commercialName: "ENTRESTO", route: "Orale", dosages: ["24/26 mg", "49/51 mg", "97/103 mg"] },

    // Diurétiques
    { class: "Diurétiques thiazidiques", dci: "Hydrochlorothiazide", commercialName: "ESIDREX", route: "Orale", dosages: ["25 mg"] },
    { class: "Diurétiques thiazidiques", dci: "Indapamide", commercialName: "FLUDEX", route: "Orale", dosages: ["1.5 mg (LP)", "2.5 mg"] },

    { class: "Diurétiques de l’anse", dci: "Furosemide", commercialName: "LASILIX", route: "Orale", dosages: ["20 mg", "40 mg", "60 mg (LP)", "500 mg"] },
    { class: "Diurétiques de l’anse", dci: "Furosemide", commercialName: "LASILIX", route: "IV / IM", dosages: ["20 mg/2ml"] },
    { class: "Diurétiques de l’anse", dci: "Bumetanide", commercialName: "BURINEX", route: "Orale", dosages: ["1 mg", "5 mg"] },

    { class: "Anti-aldostérone", dci: "Spironolactone", commercialName: "ALDACTONE", route: "Orale", dosages: ["25 mg", "50 mg", "75 mg"] },
    { class: "Anti-aldostérone", dci: "Eplerenone", commercialName: "INSPRA", route: "Orale", dosages: ["25 mg", "50 mg"] },

    // Inhibiteurs calciques
    { class: "Inhibiteurs calciques", dci: "Amlodipine", commercialName: "AMLOR", route: "Orale", dosages: ["5 mg", "10 mg"] },
    { class: "Inhibiteurs calciques", dci: "Lercanidipine", commercialName: "ZANIDIP", route: "Orale", dosages: ["10 mg", "20 mg"] },
    { class: "Inhibiteurs calciques", dci: "Nifedipine", commercialName: "ADALATE", route: "Orale", dosages: ["10 mg", "20 mg (LP)"] },
    { class: "Inhibiteurs calciques", dci: "Diltiazem", commercialName: "TILDIEM", route: "Orale", dosages: ["60 mg", "90 mg (LP)", "200 mg (LP)", "300 mg (LP)"] },
    { class: "Inhibiteurs calciques", dci: "Verapamil", commercialName: "ISOPTINE", route: "Orale", dosages: ["40 mg", "120 mg", "240 mg (LP)"] },

    // Alpha-bloquants
    { class: "Alpha-bloquants", dci: "Urapidil", commercialName: "EUPRESSYL", route: "Orale", dosages: ["30 mg", "60 mg", "90 mg"] },
    { class: "Alpha-bloquants", dci: "Urapidil", commercialName: "EUPRESSYL", route: "IV", dosages: ["50 mg/10ml", "100 mg/20ml"] },
    { class: "Alpha-bloquants", dci: "Prazosine", commercialName: "MINIPRESS", route: "Orale", dosages: ["1 mg", "5 mg"] },

    // Anti-arythmiques
    { class: "Anti-arythmique", dci: "Amiodarone", commercialName: "CORDARONE", route: "Orale", dosages: ["200 mg"] },
    { class: "Anti-arythmique", dci: "Amiodarone", commercialName: "CORDARONE", route: "IV", dosages: ["150 mg/3ml"] },
    { class: "Anti-arythmique", dci: "Flecainide", commercialName: "FLECAINE", route: "Orale", dosages: ["50 mg", "100 mg (LP)", "150 mg (LP)", "200 mg (LP)"] },
    { class: "Anti-arythmique", dci: "Digoxine", commercialName: "DIGOXINE", route: "Orale", dosages: ["0.25 mg"] },
    { class: "Anti-arythmique", dci: "Digoxine", commercialName: "HEMIGOXINE", route: "Orale", dosages: ["0.125 mg"] },

    // Anti HTA centraux
    { class: "Anti HTA centraux", dci: "Rilmenidine", commercialName: "HYPERIUM", route: "Orale", dosages: ["1 mg"] },
    { class: "Anti HTA centraux", dci: "Moxonidine", commercialName: "PHYSIOTENS", route: "Orale", dosages: ["0.2 mg", "0.4 mg"] },
    { class: "Anti HTA centraux", dci: "Clonidine", commercialName: "CATAPRESSAN", route: "Orale", dosages: ["0.15 mg"] },
    { class: "Anti HTA centraux", dci: "Methyldopa", commercialName: "ALDOMET", route: "Orale", dosages: ["250 mg", "500 mg"] }
];
