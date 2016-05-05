'use strict';

var CwrxRequest = require('../../lib/CwrxRequest.js');
var Status = require('cwrx/lib/enums.js').Status;
var Q = require('q');
var logger = require('cwrx/lib/logger.js');

var EXPIRED_STATUSES = [Status.Expired, Status.OutOfBudget];

module.exports = function(config) {
    var apiRoot = config.cwrx.api.root;
    var appCreds = config.appCreds;
    var cwrxRequest = new CwrxRequest(appCreds);
    var campaignEndpoint = apiRoot + config.cwrx.api.campaigns.endpoint;

    function rejectUpdateRequest(campaign, reason) {
        return cwrxRequest.put({
            url: campaignEndpoint + '/' + campaign.id + '/updates/' + campaign.updateRequest,
            json: {
                status: 'rejected',
                campaignExpired: true,
                rejectionReason: reason
            }
        });
    }

    function setStatus(id, status) {
        return cwrxRequest.put({
            url: campaignEndpoint + '/' + id,
            json: {
                status: status
            }
        });
    }

    function getRejectionReason(status) {
        switch(status) {
        case Status.Expired:
            return 'Your campaign has expired. Please re-submit your request with a new end-date.';
        case Status.OutOfBudget:
            return 'Your campaign has exhausted its budget. Please re-submit your request with a ' +
                'new budget.';
        default:
            throw new Error('Unsupported rejection status ' + status);
        }
    }

    return function (event) {
        var data = event.data;
        var options = event.options;
        var log = logger.getLog();
        var status = options.status;

        return Q.resolve().then(function() {
            if(data.campaign && data.campaign.id && status) {
                var campaignId = data.campaign.id;

                return Q.resolve().then(function() {
                    if (data.campaign.updateRequest && EXPIRED_STATUSES.indexOf(status) !== -1) {
                        var reason = getRejectionReason(status);
                        log.info('Rejecting update request for campaign %1 with reason %2',
                            data.campaign.id, reason);
                        return rejectUpdateRequest(data.campaign, reason);
                    }
                }).then(function() {
                    return setStatus(campaignId, status);
                }).then(function() {
                    log.info('Changed status of campaign %1 (%2) from %3 to %4',
                        data.campaign.name, campaignId, data.campaign.status, status);
                }).catch(function(error) {
                    log.error('Error updating status of campaign %1 (%2) from  %3 to %4',
                        data.campaign.name, campaignId, data.campaign.status, status);
                    return Q.reject(error);
                });
            }
        });
    };
};
