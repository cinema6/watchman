'use strict';

const CwrxRequest = require('../../../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const ld = require('lodash');
const filter = ld.filter;
const assign = ld.assign;
const get = ld.get;
const floor = ld.floor;
const q = require('q');
const Status = require('cwrx/lib/enums').Status;
const logger = require('cwrx/lib/logger');
const inspect = require('util').inspect;

module.exports = function factory(config) {
    const log = logger.getLog();
    const request = new CwrxRequest(config.appCreds);
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
            // Split this transaction between all showcase (app) campaigns
            const externalImpressionPortion = floor(
                (transaction.amount / appCampaigns.length) * paymentPlan.impressionsPerDollar
            );
            const budgetPortion = (transaction.amount / appCampaigns.length);

            return q.all(appCampaigns.map(campaign => {
                const externalCampaign = get(campaign, 'externalCampaigns.beeswax', {});

                return request.put({
                    url: campaignsEndpoint + '/' + campaign.id,
                    json: assign({}, campaign, {
                        status: Status.Active,
                        pricing: assign({}, campaign.pricing, {
                            budget: get(campaign, 'pricing.budget', 0) + budgetPortion,
                            dailyLimit: dailyLimit
                        })
                    })
                }).spread(newCampaign => (
                    request.put({
                        url: campaignsEndpoint + '/' + campaign.id + '/external/beeswax',
                        json: {
                            budgetImpressions: (externalCampaign.budgetImpressions || 0) +
                                externalImpressionPortion,
                            dailyLimitImpressions: paymentPlan.dailyImpressionLimit,
                            budget: null,
                            dailyLimit: null
                        }
                    }).spread(newExternalCampaign => {
                        log.info(
                            'Increased budget of campaign(%1): %2 => %3.',
                            campaign.id, get(campaign, 'pricing.budget', 0),
                            get(newCampaign, 'pricing.budget', 0)
                        );
                        log.info(
                            'Increased budget of externalCampaign(%1): %2 => %3.',
                            externalCampaign.externalId,
                            externalCampaign.budget, newExternalCampaign.budget
                        );
                    })
                ));
            }));
        });
    }).catch(reason => (
        log.error('Failed to increase campaign budget: %1', inspect(reason))
    )).then(() => undefined);
};
