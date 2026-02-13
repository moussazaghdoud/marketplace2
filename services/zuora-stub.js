// Zuora integration stub
// Replace method bodies with real Zuora API calls when ready

async function createAccount(data) {
    console.log('[Zuora Stub] createAccount:', JSON.stringify(data));
    return { success: true, accountId: `ZU-ACC-${Date.now()}`, stub: true };
}

async function createSubscription(accountId, planData) {
    console.log(`[Zuora Stub] createSubscription for ${accountId}:`, JSON.stringify(planData));
    return { success: true, subscriptionId: `ZU-SUB-${Date.now()}`, stub: true };
}

async function getInvoices(accountId) {
    console.log(`[Zuora Stub] getInvoices for ${accountId}`);
    return {
        success: true,
        stub: true,
        invoices: [
            {
                id: 'ZU-INV-001',
                date: new Date().toISOString().split('T')[0],
                amount: 99.90,
                status: 'Paid',
                description: 'Rainbow Business - 10 licences'
            }
        ]
    };
}

async function cancelSubscription(subscriptionId) {
    console.log(`[Zuora Stub] cancelSubscription ${subscriptionId}`);
    return { success: true, stub: true };
}

module.exports = { createAccount, createSubscription, getInvoices, cancelSubscription };
