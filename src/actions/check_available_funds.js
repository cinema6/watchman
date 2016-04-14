'use strict';

var CwrxEntities = require('../../lib/CwrxEntities.js');
var CwrxRequest = require('../../lib/CwrxRequest.js');
var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var hl = require('highland');
var url = require('url');

/**
* This action checks the balance of an org passed through data. If the balance is non positive,
* a campaignOutOfFunds event is produced to Watchman for each active campaign in the org.
*
* Supported options:
*   This action does not support any options.
*
* Required data:
*   org - Must be an org document.
*/
module.exports = function checkAvailableFundsFactory(config) {
    var accountingEndpoint = url.resolve(config.cwrx.api.root,
        config.cwrx.api.accounting.endpoint + '/balance');
    var campaignsEndpoint = url.resolve(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);
    var request = new CwrxRequest(config.appCreds);
    var producer = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);

    return function checkAvailableFunds(event) {
        var data = event.data;

        if(data.org && typeof data.org === 'object') {
            var orgId = data.org.id;

            return request.get({
                url: accountingEndpoint,
                qs: { org: orgId }
            }).spread(function(balance) {
                if(balance.balance <= 0 && balance.outstandingBudget > 0) {
                    var orgCampaigns = new CwrxEntities(campaignsEndpoint, config.appCreds, {
                        org: orgId,
                        statuses: 'active'
                    });
                    var watchmanStream = producer.createWriteStream();

                    return new Q.Promise(function(resolve, reject) {
                        hl(orgCampaigns).filter(function(campaign) {
                            return (campaign.pricing &&
                                campaign.pricing.budget &&
                                campaign.pricing.budget > 0);
                        }).map(function(campaign) {
                            return {
                                type: 'campaignOutOfFunds',
                                data: {
                                    campaign: campaign
                                }
                            };
                        }).errors(reject).pipe(watchmanStream.on('error', reject)
                            .on('finish', resolve));
                    });
                }
            });
        } else {
            return Q.reject('data.org not valid');
        }
    };
};
