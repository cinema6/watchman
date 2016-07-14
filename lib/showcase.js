'use strict';

const CwrxRequest = require('./CwrxRequest');
const resolveURL = require('url').resolve;
const spread = require('lodash/spread');
const unzip = require('lodash/unzip');
const round = require('lodash/round');
const find = require('lodash/find');
const reject = require('lodash/reject');
const filter = require('lodash/filter');
const get = require('lodash/get');
const assign = require('lodash/assign');
const identity = require('lodash/identity');
const _ = require('lodash');
const Status = require('cwrx/lib/enums').Status;
const logger = require('cwrx/lib/logger');
const BeeswaxClient = require('beeswax-client');

function getBeeswaxId(campaign) {
    return (
        get(campaign, 'externalIds.beeswax') ||
        get(campaign, 'externalCampaigns.beeswax.externalId')
    );
}

module.exports = config => {
    const request = new CwrxRequest(config.appCreds);
    const log = logger.getLog();
    const beeswax = new BeeswaxClient({
        apiRoot: config.beeswax.apiRoot,
        creds: config.state.secrets.beeswax
    });

    const campaignsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);
    const transactionsEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.transactions.endpoint
    );
    const analyticsEndpoint = resolveURL(
        config.cwrx.api.root,
        `${config.cwrx.api.analytics.endpoint}/campaigns/showcase/apps`
    );

    /**
    * Takes an `orgId` and evenly spreads the remaining views for the month across all active
    * campaigns.
    *
    * @function rebalance
    * @param {String} orgId The ID of an RC org
    * @return {Promise} A promise that will be fulfilled with the modified RC campaigns
    */
    function rebalance(orgId) {
        log.trace(`Rebalancing org(${orgId})'s campaigns.`);

        return Promise.all([
            request.get({
                url: campaignsEndpoint,
                qs: {
                    org: orgId,
                    application: 'showcase'
                }
            }),
            request.get({
                url: transactionsEndpoint,
                qs: {
                    org: orgId,
                    sort: 'cycleEnd,-1'
                }
            })
        ]).then(unzip).then(spread(spread((campaigns, transactions) => {
            const appCampaigns = filter(campaigns, { product: { type: 'app' } });
            const activeCampaigns = reject(appCampaigns, { status: Status.Canceled });
            const totalActiveCampaigns = activeCampaigns.length;
            // Find the current billing cycle transaction.
            const cycle = _(transactions).find(transaction => (
                transaction.application === 'showcase' &&
                transaction.paymentPlanId &&
                transaction.cycleEnd
            ));

            if (!cycle) {
                // Can't rebalance if the billing period has not started.
                // This will be the case when the very first campaign is created.
                log.info(
                    `Skipping rebalance of org(${orgId})'s campaigns because there ` +
                    'is no current billing cycle.'
                );

                return activeCampaigns;
            }

            const totalUserViews = cycle.targetUsers;

            log.trace(`Fetched ${campaigns.length} campaigns (${totalActiveCampaigns} active.)`);
            log.trace(
                `Identitifed current billing cycle as ${cycle.id}. ` +
                `Target views is ${totalUserViews}.`
            );

            return Promise.all([
                Promise.all(appCampaigns.map(campaign => request.get({
                    url: `${analyticsEndpoint}/${campaign.id}`
                }))).then(unzip).then(spread(identity)),
                Promise.all(activeCampaigns.map(campaign => beeswax.campaigns.find(
                    getBeeswaxId(campaign)
                ).then(response => response.payload)))
            ]).then(spread((analytics, beeswaxCampaigns) => {
                // Calculate the total number of fulfilled views across all campaigns.
                const fulfilledUserViews = _(analytics).map('cycle.users').sum();
                // Calcuate the remaining amount of views that need to be fulfilled this cycle.
                const remainingUserViews = totalUserViews - fulfilledUserViews;

                log.trace(
                    `${fulfilledUserViews} user views have been fulfilled; ` +
                    `${remainingUserViews} remain.`
                );

                return Promise.all(activeCampaigns.map(campaign => {
                    const beeswaxId = getBeeswaxId(campaign);
                    const beeswaxCampaign = find(beeswaxCampaigns, { campaign_id: beeswaxId });
                    // internalMultiplier: used to calcuate the number of 3-second completed views
                    // to deliver. This is ultimately reflected in the campaign CPV.
                    const internalMultiplier = get(
                        campaign,
                        'conversionMultipliers.internal',
                        config.campaign.conversionMultipliers.internal
                    );
                    // externalMultipler: used to calculate the number of beeswax impressions to
                    // deliver.
                    const externalMultiplier = get(
                        campaign,
                        'conversionMultipliers.external',
                        config.campaign.conversionMultipliers.external
                    );
                    // Get the number of views that have already been delivered this cycle.
                    const used = find(analytics, { campaignId: campaign.id }).cycle.users;
                    // Split the remaining views between all of the active campaigns. Add that
                    // number to the views that have already been given to the campaign for the
                    // cycle to get the new total target views for the cycle.
                    const targetUsers = used + round(remainingUserViews / totalActiveCampaigns);
                    // Get the difference between the old targetUsers and new targetUsers. This
                    // will be negative if the campaign is losing some views.
                    const addedUsers = targetUsers - get(campaign, 'targetUsers', 0);
                    // Get the `allocation` percentage of the views being added/removed
                    // (`addedUsers / totalUserViews`) and convert that into a dollar amount
                    // (`allocation * cycle.amount`.) Add that amount to the current budget to get
                    // the new budget.
                    const budget = get(campaign, 'pricing.budget', 0) +
                        round((addedUsers / totalUserViews) * cycle.amount, 2);
                    // Get the campaign's cpv. If the campaign has no cpv, calculate it by figuring
                    // out the  amount of `nonUniqueViews` that should be delivered
                    // (`addedUsers * internalMultiplier`,) and dividing the `budget` by the
                    // `nonUniqueViews`.
                    const cost = get(campaign, 'pricing.cost') ||
                        round(budget / (addedUsers * internalMultiplier), 3);
                    // Figure out the amount of beeswax impressions to add/remove to/from the
                    // campaign.
                    const externalImpressions = beeswaxCampaign.campaign_budget +
                        round(addedUsers * externalMultiplier);

                    log.trace(`campaign(${campaign.id}) has received ${used} user views.`);

                    return request.put({
                        url: `${campaignsEndpoint}/${campaign.id}`,
                        json: {
                            targetUsers,
                            pricing: assign({}, campaign.pricing, {
                                cost,
                                budget,
                                model: 'cpv'
                            })
                        }
                    }).then(spread(updatedCampaign => {
                        log.info(
                            `Changed targetUsers of campaign(${updatedCampaign.id}): ` +
                            `${campaign.targetUsers || 0} => ${updatedCampaign.targetUsers}`
                        );
                        log.info(
                            `Changed budget of campaign(${campaign.id}): ` +
                            `${get(campaign, 'pricing.budget', 0)} ` +
                            `=> ${get(updatedCampaign, 'pricing.budget', 0)}.`
                        );

                        return beeswax.campaigns.edit(beeswaxCampaign.campaign_id, {
                            campaign_budget: externalImpressions
                        }).then(response => response.payload).then(updatedBeeswaxCampaign => {
                            log.info(
                                'Changed budget of ' +
                                `beeswaxCampaign(${updatedBeeswaxCampaign.campaign_id}): ` +
                                `${beeswaxCampaign.campaign_budget} => ` +
                                `${updatedBeeswaxCampaign.campaign_budget}.`
                            );

                            return updatedCampaign;
                        });
                    }));
                }));
            }));
        })));
    }

    return { rebalance };
};
