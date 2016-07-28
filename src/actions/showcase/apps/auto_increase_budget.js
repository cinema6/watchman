'use strict';

const CwrxRequest = require('../../../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const ld = require('lodash');
const filter = ld.filter;
const assign = ld.assign;
const get = ld.get;
const round = ld.round;
const identity = ld.identity;
const spread = ld.spread;
const q = require('q');
const Status = require('cwrx/lib/enums').Status;
const logger = require('cwrx/lib/logger');
const inspect = require('util').inspect;
const BeeswaxMiddleware = require('../../../../lib/BeeswaxMiddleware');

module.exports = function factory(config) {
    const log = logger.getLog();
    const request = new CwrxRequest(config.appCreds);
    const beeswax = new BeeswaxMiddleware(
        { apiRoot: config.beeswax.apiRoot, creds: config.state.secrets.beeswax},
        { creds: config.appCreds, api: config.cwrx.api }
    );

    const campaignsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const options = event.options;
        const transaction = data.transaction;
        const dailyLimit = options.dailyLimit;
        const paymentPlan = config.paymentPlans[transaction.paymentPlanId];

        if (!paymentPlan) {
            throw new Error('Unknown payment plan id: ' + transaction.paymentPlanId);
        }

        return request.get({
            url: campaignsEndpoint,
            qs: {
                org: transaction.org,
                application: 'showcase',
                status: [
                    Status.Draft, Status.New, Status.Pending, Status.Approved, Status.Rejected,
                    Status.Active, Status.Paused, Status.Inactive, Status.Expired,
                    Status.OutOfBudget, Status.Error
                ].join(',')
            }
        }).spread(campaigns => {
            const appCampaigns = filter(campaigns, { product: { type: 'app' } });
            const totalCampaigns = appCampaigns.length;

            return q.all(appCampaigns.map(campaign => {
                const externalMultiplier = get(
                    campaign,
                    'conversionMultipliers.external',
                    config.campaign.conversionMultipliers.external
                );
                const internalMultiplier = get(
                    campaign,
                    'conversionMultipliers.internal',
                    config.campaign.conversionMultipliers.internal
                );

                const targetUsers = round(transaction.targetUsers / totalCampaigns);
                const budget = round(transaction.amount / totalCampaigns, 2);
                const externalImpressions = targetUsers * externalMultiplier;
                const cost = round(budget / (targetUsers * internalMultiplier), 3);

                return request.put({
                        url: campaignsEndpoint + '/' + campaign.id,
                        json: assign({}, campaign, {
                            status: Status.Active,
                            pricing: assign({}, campaign.pricing, {
                                cost,
                                model: 'cpv',
                                budget: get(campaign, 'pricing.budget', 0) + budget,
                                dailyLimit: dailyLimit
                            })
                        })
                    })
                    .spread(newCampaign => {
                        return beeswax.adjustCampaignBudget(newCampaign,externalImpressions)
                            .spread((beeswaxCampaign, updatedBeeswaxCampaign) => {
                            log.info(
                                'Increased budget of campaign(%1): %2 => %3.',
                                campaign.id, get(campaign, 'pricing.budget', 0),
                                get(newCampaign, 'pricing.budget', 0)
                            );
                            log.info(
                                'Increased budget of beeswaxCampaign(%1): %2 => %3.',
                                beeswaxCampaign.campaign_id,
                                beeswaxCampaign.campaign_budget,
                                updatedBeeswaxCampaign.campaign_budget
                            );
                        });
                    });
            }));
        });
    }).catch(reason => (
        log.error('Failed to increase campaign budget: %1', inspect(reason))
    )).then(() => undefined);
};
