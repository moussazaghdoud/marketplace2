// Salesforce integration stub
// Replace method bodies with real Salesforce API calls when ready

async function createLead(data) {
    console.log('[Salesforce Stub] createLead:', JSON.stringify(data));
    return { success: true, leadId: `SF-LEAD-${Date.now()}`, stub: true };
}

async function updateLead(leadId, data) {
    console.log(`[Salesforce Stub] updateLead ${leadId}:`, JSON.stringify(data));
    return { success: true, stub: true };
}

async function convertLeadToOpportunity(leadId) {
    console.log(`[Salesforce Stub] convertLeadToOpportunity ${leadId}`);
    return { success: true, opportunityId: `SF-OPP-${Date.now()}`, stub: true };
}

async function logActivity(leadId, activity) {
    console.log(`[Salesforce Stub] logActivity for ${leadId}:`, activity);
    return { success: true, stub: true };
}

module.exports = { createLead, updateLead, convertLeadToOpportunity, logActivity };
