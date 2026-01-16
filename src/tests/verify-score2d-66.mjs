import { calculateScore2Diabetes } from '../renderer/utils/calculations.js';

const inputs = {
    age: 44,
    gender: 'male',
    isSmoker: false,
    sbp: 135,
    cholTotal: 5.6892,
    cholHdl: 1.0344,
    hba1cPerc: 7.5,
    eGFR: 66,  // CHANGED to matches UI screenshot
    ageDiagnosis: 39
};

const result = calculateScore2Diabetes(inputs);
console.error(`RESULT_DFG_66: ${result}`);
