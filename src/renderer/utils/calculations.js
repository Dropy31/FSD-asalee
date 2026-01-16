/**
 * Calculates SCORE2-Diabetes Risk
 * @param {Object} inputs
 * @param {number} inputs.age - Current age (years)
 * @param {string} inputs.gender - 'male' or 'female'
 * @param {boolean} inputs.isSmoker - true if smoker
 * @param {number} inputs.sbp - Systolic Blood Pressure (mmHg)
 * @param {number} inputs.cholTotal - Total Cholesterol (mmol/L)
 * @param {number} inputs.cholHdl - HDL Cholesterol (mmol/L)
 * @param {number} inputs.hba1cPerc - HbA1c in %
 * @param {number} inputs.eGFR - eGFR (mL/min/1.73m²)
 * @param {number} inputs.ageDiagnosis - Age at diagnosis (years)
 * @returns {number|null} 10-year CVD risk percentage or null if inputs invalid/out of range
 */
function calculateScore2Diabetes(inputs) {
    const { age, gender, isSmoker, sbp, cholTotal, cholHdl, hba1cPerc, eGFR, ageDiagnosis } = inputs;

    // 1. Validation
    if ([age, sbp, cholTotal, cholHdl, hba1cPerc, eGFR, ageDiagnosis].some(v => v === null || isNaN(v))) return null;
    if (age < 40 || age >= 70) return null; // Model constraint

    // 2. Pre-processing & Unit Conversion
    const hba1c_mmol_mol = (hba1cPerc * 10.929) - 23.507;
    const ln_egfr = Math.log(eGFR);
    const smokerVal = isSmoker ? 1 : 0;

    // 3. Centering
    const c_age = (age - 60) / 5;
    const c_sbp = (sbp - 120) / 20;
    const c_tchol = (cholTotal - 6);
    const c_hdl = (cholHdl - 1.3) / 0.5;
    const c_diag_age = (ageDiagnosis - 50) / 5;
    const c_hba1c = (hba1c_mmol_mol - 31) / 9.34;
    const c_ln_egfr = (ln_egfr - 4.5) / 0.15;

    // 4. Coefficients
    const coeffs = {
        female: {
            age_lp: 0.6624, smoking_lp: 0.6139, sbp_lp: 0.1421, tchol_lp: 0.1127, hdl_lp: -0.1087, hxdiabbin_lp: 0.854,
            age_smoking_int_lp: -0.1122, age_sbp_int_lp: -0.0268, age_tchol_int_lp: -0.0181, age_hdl_int_lp: 0.0186, age_hxdiabbin_int_lp: -0.128,
            cagediab_lp: -0.118, chba1c_lp: 0.1173, clnegfr_lp: -0.0640, clnegfr_sq_lp: 0.0058, chba1c_age_int_lp: -0.0134, clnegfr_age_int_lp: 0.0169,
            s0: 0.9776, scale1: -0.5699, scale2: 0.7476
        },
        male: {
            age_lp: 0.5368, smoking_lp: 0.4774, sbp_lp: 0.1322, tchol_lp: 0.1102, hdl_lp: -0.1568, hxdiabbin_lp: 0.657,
            age_smoking_int_lp: -0.0672, age_sbp_int_lp: -0.0167, age_tchol_int_lp: -0.0200, age_hdl_int_lp: 0.0095, age_hxdiabbin_int_lp: -0.094,
            cagediab_lp: -0.0998, chba1c_lp: 0.0955, clnegfr_lp: -0.0591, clnegfr_sq_lp: 0.0062, chba1c_age_int_lp: -0.0196, clnegfr_age_int_lp: 0.0115,
            s0: 0.9605, scale1: -0.7380, scale2: 0.7019
        }
    };

    // Normalize gender string (handle 'M'/'F' inputs if necessary, though function expects 'male'/'female')
    // The coefficients key is 'male'/'female'.
    // If passing 'M'/'F', we should Map it. Ideally calling function does this.
    // Assuming calling function passes 'male' or 'female'.

    // Safety check just in case
    const genderKey = (gender.toLowerCase() === 'm' || gender.toLowerCase() === 'homme') ? 'male' :
        (gender.toLowerCase() === 'f' || gender.toLowerCase() === 'femme') ? 'female' : gender.toLowerCase();

    if (!coeffs[genderKey]) return null;

    const c = coeffs[genderKey];

    // 5. Linear Predictor Calculation
    const lp =
        c.age_lp * c_age +
        c.smoking_lp * smokerVal +
        c.sbp_lp * c_sbp +
        c.tchol_lp * c_tchol +
        c.hdl_lp * c_hdl +
        (c.age_smoking_int_lp * c_age * smokerVal) +
        (c.age_sbp_int_lp * c_age * c_sbp) +
        (c.age_tchol_int_lp * c_age * c_tchol) +
        (c.age_hdl_int_lp * c_age * c_hdl) +
        (c.hxdiabbin_lp) +
        (c.age_hxdiabbin_int_lp * c_age) +
        (c.cagediab_lp * c_diag_age) +
        (c.chba1c_lp * c_hba1c) +
        (c.clnegfr_lp * c_ln_egfr) +
        (c.clnegfr_sq_lp * (c_ln_egfr ** 2)) +
        (c.chba1c_age_int_lp * c_hba1c * c_age) +
        (c.clnegfr_age_int_lp * c_ln_egfr * c_age);

    // 6. Uncalibrated Risk
    const uncalibratedRisk = 1 - Math.pow(c.s0, Math.exp(lp));

    // 7. Calibrated Risk (Percentage)
    // Formula: Risk_final = (1 - exp(-exp(Scale1 + Scale2 * ln(-ln(1 - Risk_uncalibrated))))) * 100

    // Safety check for 0 or 1
    if (uncalibratedRisk >= 1) return 99.9;
    if (uncalibratedRisk <= 0) return 0.1;

    const calibratedRisk = (1 - Math.exp(-Math.exp(c.scale1 + c.scale2 * Math.log(-Math.log(1 - uncalibratedRisk))))) * 100;

    return parseFloat(calibratedRisk.toFixed(1));
}
