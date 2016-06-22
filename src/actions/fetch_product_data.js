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
            if (typeof object1 !== typeof object2) { //type mismatch
                return false;
            }
            else if ((!isObject(object1))&&(!isObject(object2))) {
                if (object1 !== object2) { //if not equal
                    return false;
                }
            }
            else if ((isObject(object1))&&(isObject(object2))) { //if both objects
                if (Object.keys(object1).length!==Object.keys(object2).length) {
                    return false; //if one is missing properties
                }
                for (var prop in object1) {
                    if (((isObject(object1[prop]))&&(isObject(object2[prop])))) {
                        for (var subProp in object1[prop]) {
                            if (isEqual(object1[prop], object2[prop]) === false) {
                                return false;
                            }
                        }
                    }
                    if (typeof object1[prop] !== typeof object2[prop]) { //type mismatch
                        return false;
                    }
                    else if ((!isObject(object1[prop]))&&(!isObject(object2[prop]))) {
                        if (object1[prop] !== object2[prop]) { //if not equal
                            return false;
                        }
                    }
                }
            }
            return true;
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
