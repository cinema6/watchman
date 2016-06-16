'use strict';

var CwrxEntities = require('../../lib/CwrxEntities.js');
var CwrxRequest = require('../../lib/CwrxRequest.js');
var logger = require('cwrx/lib/logger.js');
var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var hl = require('highland');
var ld = require('lodash');
var urlUtils = require('url');

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
    var log = logger.getLog();
    var orgUrl = urlUtils.resolve(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);
    var campUrl = urlUtils.resolve(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);
    var balanceUrl = urlUtils.resolve(
        config.cwrx.api.root,
        config.cwrx.api.accounting.endpoint + '/balances'
    );

    var request = new CwrxRequest(config.appCreds);
    var producer = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);

    return function checkAvailableFunds(/*event*/) {
        var orgStream = new CwrxEntities(orgUrl, config.appCreds);
        var watchmanStream = producer.createWriteStream();
        
        return new Q.Promise(function(resolve, reject) {
            return hl(orgStream.on('error', reject))
            .flatten()
            .batchWithTimeOrCount(null, 50) // handle batches of 50 orgs at a time
            .flatMap(function(orgBatch) {
                var idStr = orgBatch.map(function(org) { return org.id; }).join(',');
                
                // fetch balance stats for this batch of orgs
                return hl(request.get({
                    url: balanceUrl,
                    qs: { orgs: idStr }
                })
                .spread(function(statsObj) {
                    return orgBatch.filter(function(org) {
                        var stats = statsObj[org.id];
                        // skip any orgs without stats
                        if (!stats) {
                            return false;
                        }
                        // skip orgs that still have balance, or have no outstanding budet
                        if (stats.balance > 0 || stats.outstandingBudget <= 0) {
                            return false;
                        }
                        return true;
                    });
                }).catch(reject))
                .flatten();
            })
            .flatMap(function(org) {
                log.info('Org %1 is out of funds', org.id);
                // map + return all of the org's active campaigns
                return hl(new CwrxEntities(
                    campUrl,
                    config.appCreds,
                    { org: org.id, statuses: 'active' }
                ).on('error', reject));
            })
            .flatten()
            .filter(function(campaign) { // filter out campaigns without budget
                return ld.get(campaign, 'pricing.budget', 0) > 0;
            })
            .map(function(campaign) { // map to out of funds event objects
                return {
                    type: 'campaignOutOfFunds',
                    data: {
                        campaign: campaign
                    }
                };
            })
            .pipe(watchmanStream.on('error', reject)) // produce to watchman event stream
            .on('finish', resolve);
        });
    };
};
