'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    deleteRequestBudgetsByResetsAt:(...values)=>execute(db,'DELETE FROM request_budgets WHERE resets_at<=?','run',values),
    findRequestBudgetsByKey:(...values)=>execute(db,'SELECT 1 FROM request_budgets WHERE key=?','get',values),
    countRequestBudgets:(...values)=>execute(db,'SELECT count(*) n FROM request_budgets','get',values),
    findRequestBudgets:(...values)=>execute(db,`INSERT INTO request_budgets(key,hits,resets_at) VALUES(?,1,?)
            ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits,resets_at`,'get',values)
});
