'use strict';
const {execute}=require('./execute.cjs');
// Privileged domain operations; values are always bound, never interpolated.
module.exports = db => Object.freeze({
    countTickets:(...values)=>execute(db,'SELECT count(*) n FROM tickets','get',values),
    countTicketsByStatus:(...values)=>execute(db,"SELECT count(*) n FROM tickets WHERE status='open'",'get',values),
    countAuditLogsByActionAndCreatedAt:(...values)=>execute(db,"SELECT count(*) n FROM audit_logs WHERE action='ADMIN_LOGIN_FAILED' AND created_at>=?",'get',values),
    addEvent:(...values)=>execute(db,'INSERT OR IGNORE INTO analytics_events(id,type,created_at,product_id,category,result_count,failure_code) VALUES(?,?,?,?,?,?,?)','run',values),
    countEvents:()=>execute(db,'SELECT count(*) n FROM analytics_events','get',[]),
    pruneEvents:(...values)=>execute(db,'DELETE FROM analytics_events WHERE created_at<?','run',values),
    eventCounts:(...values)=>execute(db,'SELECT type,count(*) n FROM analytics_events WHERE created_at>=? AND created_at<? GROUP BY type','all',values),
    failureCounts:(...values)=>execute(db,"SELECT failure_code,count(*) n FROM analytics_events WHERE type='checkout_validation_failed' AND created_at>=? AND created_at<? GROUP BY failure_code ORDER BY n DESC",'all',values),
    zeroSearches:(...values)=>execute(db,"SELECT count(*) n FROM analytics_events WHERE type='search' AND result_count=0 AND created_at>=? AND created_at<?",'get',values),
    productCounts:(...values)=>execute(db,"SELECT product_id,type,count(*) n FROM analytics_events WHERE product_id IS NOT NULL AND created_at>=? AND created_at<? GROUP BY product_id,type",'all',values),
    categoryCounts:(...values)=>execute(db,"SELECT category,type,count(*) n FROM analytics_events WHERE category IS NOT NULL AND created_at>=? AND created_at<? GROUP BY category,type",'all',values),
    dailyJourney:(...values)=>execute(db,"SELECT substr(created_at,1,10) date,type,count(*) n FROM analytics_events WHERE type IN ('checkout_started','checkout_validation_failed','order_created') AND created_at>=? AND created_at<? GROUP BY date,type ORDER BY date",'all',values)
});
