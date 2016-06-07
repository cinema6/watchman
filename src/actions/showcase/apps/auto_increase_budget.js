'use strict';

var CwrxRequest = require('../../../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var ld = require('lodash');
var filter = ld.filter;
var assign = ld.assign;
var get = ld.get;
var floor = ld.floor;
var q = require('q');
var Status = require('cwrx/lib/enums').Status;
var logger = require('cwrx/lib/logger');
var inspect = require('util').inspect;

module.exports = function autoIncreaseBudgetFactory(config) {
    var log = logger.getLog();
    var request = new CwrxRequest(config.appCreds);
    var campaignsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);

    return function autoIncreaseBudget(event) { return q().then(function() {
        var data = event.data;
        var options = event.options;
        var transaction = data.transaction;
        var transactionDescription = (function() {
            try {
                return JSON.parse(transaction.description) || {};
            } catch(error) {
                throw new Error('"' + transaction.description + '" is not JSON.');
            }
        }());
        var dailyLimit = options.dailyLimit;
        var paymentPlan = config.paymentPlans[transactionDescription.paymentPlanId];

        if (!paymentPlan) {
            throw new Error('Unknown payment plan id: ' + transactionDescription.paymentPlanId);
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
        }).spread(function increaseBudgets(campaigns) {
            var appCampaigns = filter(campaigns, { product: { type: 'app' } });
            // Split this transaction between all showcase (app) campaigns
            var externalImpressionPortion = floor(
                (transaction.amount / appCampaigns.length) * paymentPlan.impressionsPerDollar
            );
            var budgetPortion = (transaction.amount / appCampaigns.length);

            return q.all(appCampaigns.map(function increaseBudget(campaign) {
                var externalCampaign = get(campaign, 'externalCampaigns.beeswax', {});

                return request.put({
                    url: campaignsEndpoint + '/' + campaign.id,
                    json: assign({}, campaign, {
                        status: Status.Active,
                        pricing: assign({}, campaign.pricing, {
                            budget: get(campaign, 'pricing.budget', 0) + budgetPortion,
                            dailyLimit: dailyLimit
                        })
                    })
                }).spread(function increaseExternalBudget(newCampaign) {
                    return request.put({
                        url: campaignsEndpoint + '/' + campaign.id + '/external/beeswax',
                        json: {
                            budgetImpressions: (externalCampaign.budgetImpressions || 0) +
                                externalImpressionPortion,
                                dailyLimitImpressions: paymentPlan.dailyImpressionLimit,
                                budget: null,
                                dailyLimit: null
                        }
                    }).spread(function logSuccess(newExternalCampaign) {
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
                    });
                });
            }));
        });
    }).catch(function logError(reason) {
        return log.error('Failed to increase campaign budget: %1', inspect(reason));
    }).thenResolve(undefined); };
};
