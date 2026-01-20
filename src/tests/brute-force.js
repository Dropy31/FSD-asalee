const { calculateScore2Diabetes } = require('../renderer/calculations.js');

const baseInputs = {
    age: 44, gender: 'male', isSmoker: false, sbp: 135,
    cholTotal: 5.6892, cholHdl: 1.0344, hba1cPerc: 7.5, eGFR: 66, ageDiagnosis: 39
};

// Iteration
const agesDiag = [20, 30, 39, 44, 50, 60];
const smokers = [false, true];
const genders = ['male', 'female'];

console.log('Searching for ~9.8%...');

for (const sm of smokers) {
    for (const ad of agesDiag) {
        const t = { ...baseInputs, isSmoker: sm, ageDiagnosis: ad };
        const res = calculateScore2Diabetes(t);
        if (Math.abs(res - 9.8) < 0.2) {
            console.log(`MATCH FOUND: Smoker=${sm}, AgeDiag=${ad} => ${res}%`);
        }
    }
}
