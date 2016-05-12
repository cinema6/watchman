'use strict';

var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var ld = require('lodash');
var filter = ld.filter;
var assign = ld.assign;
var q = require('q');
var Status = require('cwrx/lib/enums').Status;
var logger = require('cwrx/lib/logger');
var inspect = require('util').inspect;

module.exports = function autoIncreaseBudgetFactory(config) {
    var log = logger.getLog();
    var request = new CwrxRequest(config.appCreds);
    var campaignsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);

    return function autoIncreaseBudget(event) {
        var data = event.data;
        var transaction = data.transaction;

        return request.get({
            url: campaignsEndpoint,
            qs: { org: transaction.org }
        }).spread(function increaseBudgets(campaigns) {
            var showcaseCampaigns = filter(campaigns, { application: 'showcase' });

            return q.all(showcaseCampaigns.map(function increaseBudget(campaign) {
                // Split this transaction between ALL campaigns (even though we will only increase
                // the budgets of showcase campaigns.)
                var portion = (transaction.amount / campaigns.length);

                return request.put({
                    url: campaignsEndpoint + '/' + campaign.id,
                    json: assign({}, campaign, {
                        status: Status.Active,
                        pricing: assign({}, campaign.pricing, {
                            budget: campaign.pricing.budget + portion
                        })
                    })
                }).spread(function(updatedCampaign) {
                    return log.info(
                        'Increased budget of campaign(%1): %2 => %3.',
                        campaign.id, campaign.pricing.budget, updatedCampaign.pricing.budget
                    );
                }).catch(function logError(reason) {
                    return log.error('Failed to increase campaign budget: %1', inspect(reason));
                });
            }));
        }).thenResolve(undefined);
    };
};