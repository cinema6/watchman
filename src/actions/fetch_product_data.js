'use strict';

var JsonProducer         = require('rc-kinesis').JsonProducer,
    CwrxRequest            = require('../../lib/CwrxRequest'),
    resolveURL             = require('url').resolve,
    logger                 = require('cwrx/lib/logger.js'),
    q                     = require('q'),
    log                    = logger.getLog();

module.exports = function fetchProductDataFactory(config) {
    var watchmanStream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var request = new CwrxRequest(config.appCreds);
    var dataEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.productData.endpoint);
    var campEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);

    function isObject(obj) {
        return((typeof obj === 'object') && (obj !== null));
    }

    function isEqual(object1, object2) {

        if (typeof object1 !== typeof object2) {
            return false;
        }
        else if ((!isObject(object1))&&(!isObject(object2))) {
            return (object1 === object2);
        }
        else {
            if (Object.keys(object1).length!==Object.keys(object2).length) {
                return false;
            }
            for (var prop in object1) {
                if (isEqual(object1[prop], object2[prop])===false) {
                    return false;
                }
            }
            return true;
        }
    }

    return function fetchProductData(event) {
        var campaign = event.data.campaign;
        var id = campaign.id;
        return request.get({
            url: dataEndpoint,
            qs: {uri: campaign.product.uri}
        }).then(function (data) {
            if (isEqual(campaign.product.data, data)) {
                data.name = campaign.product.name;
                data.description = campaign.product.description;
                return request.put({
                    url: campEndpoint + '/' + id,
                    json: {product: data}
                });
            }
            else {
                log.info('No data changes to update [%1]', id);
                return q.reject('No data changes to update');
            }
        }).then(function() {
            return watchmanStream.produce({
                type: 'campaignRefreshed',
                data: {
                    campaign: campaign,
                    date: new Date()
                }
            });
        }).catch(function(error) {
            log.info(error);
        });
    };
};
